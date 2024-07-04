require("dotenv").config();

const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
const PDFDocument = require("pdfkit");
const AdmZip = require("adm-zip");

let whitelistedExtensions = [];

function loadWhitelist() {
  const whitelistPath = process.env.WHITELIST_PATH || "./whitelist.txt";
  try {
    const content = fs.readFileSync(whitelistPath, "utf8");
    whitelistedExtensions = content
      .split("\n")
      .map((ext) => ext.trim())
      .filter(Boolean);
    console.log("Loaded whitelist:", whitelistedExtensions);
  } catch (error) {
    console.error("Error loading whitelist:", error.message);
    process.exit(1);
  }
}

async function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const extractPath = path.join(__dirname, "temp_extracted");
  zip.extractAllTo(extractPath, true);
  return extractPath;
}

async function convertToPDF(inputPath) {
  const git = simpleGit();
  const doc = new PDFDocument();

  try {
    let localPath = inputPath;

    if (inputPath.endsWith(".zip")) {
      localPath = await extractZip(inputPath);
    } else if (inputPath.startsWith("http") || inputPath.startsWith("git@")) {
      localPath = path.join(__dirname, "temp_repo");
      await git.clone(inputPath, localPath);
    }

    const files = await getFiles(localPath);

    const outputPdfName = process.env.OUTPUT_PDF_NAME || "output.pdf";
    doc.pipe(fs.createWriteStream(outputPdfName));

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        doc.fontSize(14).text(file, { underline: true });
        doc.fontSize(10).text(content);
        doc.addPage();
      } catch (error) {
        console.warn(`Skipping file ${file}: ${error.message}`);
      }
    }

    doc.end();
    console.log(`PDF created successfully: ${outputPdfName}`);

    if (localPath !== inputPath) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function getFiles(dir) {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(
    files.map((file) => {
      const res = path.resolve(dir, file.name);
      return file.isDirectory() ? getFiles(res) : res;
    })
  );
  return paths.flat().filter((file) => {
    const ext = path.extname(file);
    return (
      !file.includes("node_modules") &&
      !file.includes(".git") &&
      whitelistedExtensions.includes(ext)
    );
  });
}

loadWhitelist();
const inputPath = process.env.INPUT_PATH || ".";
convertToPDF(inputPath);
