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
  const whitelistPath = process.env.WHITELIST_PATH || "./config/whitelist.txt";
  const blacklistPath = process.env.BLACKLIST_PATH || "./config/blacklist.txt";

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

async function getInputPath(inputPath) {
  const git = simpleGit();
  let localPath = inputPath;

  if (inputPath.endsWith(".zip")) {
    localPath = await extractZip(inputPath);
  } else if (inputPath.startsWith("http") || inputPath.startsWith("git@")) {
    localPath = path.join(__dirname, "temp_repo");
    await git.clone(inputPath, localPath);
  }

  return localPath;
}

function prepareOutputPath(outputPath) {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputPath;
}

function createOutputFiles(outputPath, outputFormat, numChunks) {
  const chunkMode = numChunks > 1;
  let docs = [];
  let txtContents = [];

  if (chunkMode) {
    for (let i = 0; i < numChunks; i++) {
      if (outputFormat === "pdf") {
        docs.push(new PDFDocument());
        docs[i].pipe(fs.createWriteStream(`${outputPath}_${i + 1}.pdf`));
      } else {
        txtContents.push("");
      }
    }
  } else {
    if (outputFormat === "pdf") {
      docs.push(new PDFDocument());
      docs[0].pipe(fs.createWriteStream(`${outputPath}.pdf`));
    } else {
      txtContents.push("");
    }
  }

  return { docs, txtContents, chunkMode };
}

function processFile(
  file,
  localPath,
  docs,
  txtContents,
  outputFormat,
  currentChunk
) {
  try {
    let content = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(localPath, file);
    const fileExt = path.extname(file).toLowerCase();

    if (fileExt === ".xml" || fileExt === ".json") {
      content = cleanupContent(content, fileExt);
    }

    if (outputFormat === "pdf") {
      docs[currentChunk].fontSize(14).text(relativePath, { underline: true });
      docs[currentChunk].fontSize(10).text(content);
      docs[currentChunk].addPage();
    } else {
      txtContents[currentChunk] += `File: ${relativePath}\n\n${content}\n\n`;
    }
  } catch (error) {
    console.warn(`Skipping file ${file}: ${error.message}`);
  }
}

function cleanupContent(content, fileExt) {
  content = content.replace(/™/g, "");
  content = content.replace(/[^\x20-\x7E\n\r\t]/g, "");

  if (fileExt === ".json") {
    try {
      const parsedJson = JSON.parse(content);
      content = JSON.stringify(parsedJson, null, 2);
    } catch (error) {
      console.warn("Failed to parse JSON, using original content");
    }
  }

  if (fileExt === ".xml") {
    content = content.replace(/>\s+</g, "><");
    content = content.replace(/(<[^>]+>)/g, "\n$1");
  }

  return content;
}

function saveOutputFiles(
  docs,
  txtContents,
  outputPath,
  outputFormat,
  chunkMode
) {
  if (outputFormat === "pdf") {
    docs.forEach((doc, index) => {
      doc.end();
      const fileName = chunkMode
        ? `${path.basename(outputPath)}_${index + 1}.pdf`
        : `${path.basename(outputPath)}.pdf`;
      console.log(
        `PDF ${
          chunkMode ? `chunk ${index + 1}` : "file"
        } created successfully: ${path.join(
          path.dirname(outputPath),
          fileName
        )}`
      );
    });
  } else {
    txtContents.forEach((content, index) => {
      const fileName = chunkMode
        ? `${path.basename(outputPath)}_${index + 1}.txt`
        : `${path.basename(outputPath)}.txt`;
      fs.writeFileSync(path.join(path.dirname(outputPath), fileName), content);
      console.log(
        `TXT ${
          chunkMode ? `chunk ${index + 1}` : "file"
        } created successfully: ${path.join(
          path.dirname(outputPath),
          fileName
        )}`
      );
    });
  }
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
  if (
    blacklistPatterns.some((pattern) =>
      minimatch(filePath, pattern, { dot: true })
    )
  ) {
    return false;
  }
  return whitelistPatterns.some((pattern) =>
    minimatch(filePath, pattern, { dot: true })
  );
}

async function convertToOutput(inputPath) {
  const outputFormat = process.env.OUTPUT_FORMAT || "pdf";
  const numChunks = parseInt(process.env.NUM_CHUNKS) || 1;

  try {
    const localPath = await getInputPath(inputPath);
    const files = await getFiles(localPath);
    const outputPath = prepareOutputPath(
      process.env.OUTPUT_PATH || path.join(__dirname, "outputs", "output")
    );

    const { docs, txtContents, chunkMode } = createOutputFiles(
      outputPath,
      outputFormat,
      numChunks
    );

    let currentChunk = 0;
    for (const file of files) {
      processFile(
        file,
        localPath,
        docs,
        txtContents,
        outputFormat,
        currentChunk
      );
      if (chunkMode) {
        currentChunk = (currentChunk + 1) % numChunks;
      }
    }

    saveOutputFiles(docs, txtContents, outputPath, outputFormat, chunkMode);

    if (localPath !== inputPath) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Load patterns and start conversion
loadPatterns();
const inputPath = process.env.INPUT_PATH || path.join(__dirname, "inputs");
convertToOutput(inputPath);
