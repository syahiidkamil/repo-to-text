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
  // Validate output format
  if (!["pdf", "txt", "docx"].includes(outputFormat)) {
    throw new Error("Invalid OUTPUT_FORMAT. Must be 'pdf', 'txt', or 'docx'");
  }

  const numChunks = parseInt(process.env.NUM_CHUNKS) || 1;
  const projectTypes = (process.env.PROJECT_TYPE || "default")
    .split(",")
    .map((type) => type.trim());

  try {
    console.log("Starting conversion process...");
    console.log(`Output format: ${outputFormat}`);
    console.log(`Number of chunks: ${numChunks}`);
    console.log(`Project types: ${projectTypes.join(", ")}`);

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
      // For both txt and docx formats
      txtContents[0] =
        `Project Structure:\n\n${folderStructure}\n\n` + txtContents[0];
    }

    let currentChunk = 0;
    let processedFiles = 0;
    const totalFiles = filteredFiles.length;

    for (const file of filteredFiles) {
      processFile(
        file,
        localPath,
        docs,
        txtContents,
        outputFormat,
        currentChunk
      );

      processedFiles++;
      if (processedFiles % 10 === 0) {
        console.log(
          `Progress: ${processedFiles}/${totalFiles} files processed`
        );
      }

      if (chunkMode) {
        currentChunk = (currentChunk + 1) % numChunks;
      }
    }

    await saveOutputFiles(
      docs,
      txtContents,
      outputPath,
      outputFormat,
      chunkMode
    );

    if (localPath !== inputPath) {
      fs.rmSync(localPath, { recursive: true, force: true });
      console.log("Temporary files cleaned up");
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    console.log(`Conversion completed in ${duration.toFixed(2)} seconds`);
    console.log(`Total files processed: ${processedFiles}`);
    console.log(`Output format: ${outputFormat.toUpperCase()}`);
    console.log(`Output location: ${outputPath}`);
  } catch (error) {
    console.error("Error during conversion:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`Process failed after ${duration.toFixed(2)} seconds`);
    process.exit(1);
  }
}

// Get input path from environment variable or use default
const inputPath = process.env.INPUT_PATH || path.join(__dirname, "inputs");

// Start the conversion process
console.log("Starting repository conversion tool...");
console.log(`Version: ${require("./package.json").version}`);
console.log(`Node.js version: ${process.version}`);
console.log("----------------------------------------");

convertToOutput(inputPath).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
