// utils/fileSystem.js
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const simpleGit = require("simple-git");
const minimatch = require("minimatch");

async function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const extractPath = path.join(__dirname, "../temp_extracted");
  zip.extractAllTo(extractPath, true);
  return extractPath;
}

async function getInputPath(inputPath) {
  const git = simpleGit();
  let localPath = inputPath;

  if (inputPath.endsWith(".zip")) {
    localPath = await extractZip(inputPath);
  } else if (inputPath.startsWith("http") || inputPath.startsWith("git@")) {
    localPath = path.join(__dirname, "../temp_repo");
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

async function getFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? getFiles(res) : res;
    })
  );
  return files.flat();
}

function isFileAllowed(filePath, whitelistPatterns, blacklistPatterns) {
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

// New function to map folder structure
async function mapFolderStructure(dir, prefix = "", basePath = "", pathType = "relative", repoBasePath = "") {
  let structure = "";
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const sortedEntries = entries.sort((a, b) => {
    // Directories first, then files
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    const isLast = i === sortedEntries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? prefix + "    " : prefix + "│   ";

    const entryPath = path.join(basePath, entry.name);
    // For absolute paths, replace the temp directory with the repo base path if specified
    let displayName;
    if (pathType === "absolute") {
      if (repoBasePath) {
        // Replace the temp directory path with the repo base path
        displayName = repoBasePath ? path.join(repoBasePath, entry.name) : path.join(dir, entry.name);
      } else {
        displayName = path.join(dir, entry.name);
      }
    } else {
      displayName = entry.name;
    }
    structure += `${prefix}${connector}${displayName}${
      entry.isDirectory() ? "/" : ""
    }\n`;

    if (entry.isDirectory()) {
      structure += await mapFolderStructure(
        path.join(dir, entry.name),
        childPrefix,
        entryPath,
        pathType,
        repoBasePath ? path.join(repoBasePath, entry.name) : ""
      );
    }
  }

  return structure;
}

module.exports = {
  extractZip,
  getInputPath,
  prepareOutputPath,
  getFiles,
  isFileAllowed,
  mapFolderStructure,
};
