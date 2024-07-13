require("dotenv").config();
const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
const PDFDocument = require("pdfkit");
const AdmZip = require("adm-zip");
const minimatch = require("minimatch");

let whitelistPatterns = [];
let blacklistPatterns = [];

function loadPatterns() {
  const whitelistPath = process.env.WHITELIST_PATH || "./whitelist.txt";
  const blacklistPath = process.env.BLACKLIST_PATH || "./blacklist.txt";

  try {
    whitelistPatterns = fs
      .readFileSync(whitelistPath, "utf8")
      .split("\n")
      .map((pattern) => pattern.trim())
      .filter(Boolean);
    console.log("Loaded whitelist patterns:", whitelistPatterns);

    blacklistPatterns = fs
      .readFileSync(blacklistPath, "utf8")
      .split("\n")
      .map((pattern) => pattern.trim())
      .filter(Boolean);
    console.log("Loaded blacklist patterns:", blacklistPatterns);
  } catch (error) {
    console.error("Error loading patterns:", error.message);
    process.exit(1);
  }
}

async function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const extractPath = path.join(__dirname, "temp_extracted");
  zip.extractAllTo(extractPath, true);
  return extractPath;
}

async function convertToOutput(inputPath) {
  const git = simpleGit();
  const outputFormat = process.env.OUTPUT_FORMAT || "pdf";
  let doc;
  let txtContent = "";

  if (outputFormat === "pdf") {
    doc = new PDFDocument();
  }

  try {
    let localPath = inputPath;

    // Handle different input types
    if (inputPath.endsWith(".zip")) {
      localPath = await extractZip(inputPath);
    } else if (inputPath.startsWith("http") || inputPath.startsWith("git@")) {
      localPath = path.join(__dirname, "temp_repo");
      await git.clone(inputPath, localPath);
    }

    // Get list of files
    const files = await getFiles(localPath);

    // Create output file
    const outputName = process.env.OUTPUT_NAME || `output.${outputFormat}`;
    if (outputFormat === "pdf") {
      doc.pipe(fs.createWriteStream(outputName));
    }

    for (const file of files) {
      try {
        let content = fs.readFileSync(file, "utf8");
        const relativePath = path.relative(localPath, file);
        const fileExt = path.extname(file).toLowerCase();

        // Preprocess content based on file type
        if (fileExt === ".xml" || fileExt === ".json") {
          content = cleanupContent(content, fileExt);
        }

        if (outputFormat === "pdf") {
          doc.fontSize(14).text(relativePath, { underline: true });
          doc.fontSize(10).text(content);
          doc.addPage();
        } else {
          txtContent += `File: ${relativePath}\n\n${content}\n\n`;
        }
      } catch (error) {
        console.warn(`Skipping file ${file}: ${error.message}`);
      }
    }

    if (outputFormat === "pdf") {
      doc.end();
    } else {
      fs.writeFileSync(outputName, txtContent);
    }
    console.log(
      `${outputFormat.toUpperCase()} created successfully: ${outputName}`
    );

    // Clean up temporary directory
    if (localPath !== inputPath) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

function cleanupContent(content, fileExt) {
  // Remove unwanted "TM" symbols
  content = content.replace(/™/g, "");

  // Remove non-printable characters
  content = content.replace(/[^\x20-\x7E\n\r\t]/g, "");

  // Attempt to parse and re-stringify JSON to fix formatting
  if (fileExt === ".json") {
    try {
      const parsedJson = JSON.parse(content);
      content = JSON.stringify(parsedJson, null, 2);
    } catch (error) {
      console.warn("Failed to parse JSON, using original content");
    }
  }

  // For XML, we could use a library like 'xml2js' for more robust parsing and reformatting
  // For simplicity, we'll just do basic cleanup here
  if (fileExt === ".xml") {
    content = content.replace(/>\s+</g, "><");
    content = content.replace(/(<[^>]+>)/g, "\n$1");
  }

  return content;
}

async function getFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? getFiles(res) : res;
    })
  );
  return files.flat().filter((file) => isFileAllowed(path.relative(dir, file)));
}

function isFileAllowed(filePath) {
  // Check blacklist first
  if (
    blacklistPatterns.some((pattern) =>
      minimatch(filePath, pattern, { dot: true })
    )
  ) {
    return false;
  }

  // Then check whitelist
  return whitelistPatterns.some((pattern) =>
    minimatch(filePath, pattern, { dot: true })
  );
}

// Load patterns and start conversion
loadPatterns();
const inputPath = process.env.INPUT_PATH || ".";
convertToOutput(inputPath);
