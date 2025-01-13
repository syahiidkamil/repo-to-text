// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  getInputPath,
  prepareOutputPath,
  getFiles,
  isFileAllowed,
  mapFolderStructure,
} = require("./utils/fileSystem");

const {
  createOutputFiles,
  processFile,
  saveOutputFiles,
} = require("./utils/contentProcessor");

let whitelistPatterns = [];
let blacklistPatterns = [];

function loadPatterns(projectTypes) {
  whitelistPatterns = [];
  blacklistPatterns = [];

  projectTypes.forEach((projectType) => {
    const whitelistPath = path.join(
      __dirname,
      "config",
      projectType,
      "whitelist.txt"
    );
    const blacklistPath = path.join(
      __dirname,
      "config",
      projectType,
      "blacklist.txt"
    );

    try {
      const whitelistContent = fs.readFileSync(whitelistPath, "utf8");
      const blacklistContent = fs.readFileSync(blacklistPath, "utf8");

      whitelistPatterns = whitelistPatterns.concat(
        whitelistContent
          .split("\n")
          .map((pattern) => pattern.trim())
          .filter(Boolean)
      );
      blacklistPatterns = blacklistPatterns.concat(
        blacklistContent
          .split("\n")
          .map((pattern) => pattern.trim())
          .filter(Boolean)
      );

      console.log(`Loaded patterns for ${projectType}`);
    } catch (error) {
      console.error(
        `Error loading patterns for ${projectType}:`,
        error.message
      );
    }
  });

  // Remove duplicates
  whitelistPatterns = [...new Set(whitelistPatterns)];
  blacklistPatterns = [...new Set(blacklistPatterns)];

  console.log("Final whitelist patterns:", whitelistPatterns);
  console.log("Final blacklist patterns:", blacklistPatterns);
}

async function convertToOutput(inputPath) {
  const startTime = Date.now();

  const outputFormat = process.env.OUTPUT_FORMAT || "pdf";
  const numChunks = parseInt(process.env.NUM_CHUNKS) || 1;
  const projectTypes = (process.env.PROJECT_TYPE || "")
    .split(",")
    .map((type) => type.trim());

  try {
    console.log("Starting conversion process...");
    loadPatterns(projectTypes);
    const localPath = await getInputPath(inputPath);
    console.log(`Input path prepared: ${localPath}`);

    console.log("Mapping folder structure...");
    const folderStructure = await mapFolderStructure(localPath);
    console.log("Folder structure mapped successfully");

    const files = await getFiles(localPath);
    const filteredFiles = files.filter((file) =>
      isFileAllowed(
        path.relative(localPath, file),
        whitelistPatterns,
        blacklistPatterns
      )
    );
    console.log(`Found ${filteredFiles.length} files to process`);

    const outputPath = prepareOutputPath(
      process.env.OUTPUT_PATH || path.join(__dirname, "outputs", "output")
    );
    console.log(`Output path prepared: ${outputPath}`);

    const { docs, txtContents, chunkMode } = createOutputFiles(
      outputPath,
      outputFormat,
      numChunks
    );

    if (outputFormat === "pdf") {
      docs[0].fontSize(16).text("Project Structure:", { underline: true });
      docs[0].fontSize(10).text(folderStructure);
      docs[0].addPage();
    } else {
      txtContents[0] =
        `Project Structure:\n\n${folderStructure}\n\n` + txtContents[0];
    }

    let currentChunk = 0;
    for (const file of filteredFiles) {
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
      console.log("Temporary files cleaned up");
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    console.log(`Conversion completed in ${duration.toFixed(2)} seconds`);
  } catch (error) {
    console.error("Error:", error.message);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    console.log(`Process failed after ${duration.toFixed(2)} seconds`);
  }
}

// Start conversion
const inputPath = process.env.INPUT_PATH || path.join(__dirname, "inputs");
convertToOutput(inputPath);
