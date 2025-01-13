// utils/contentProcessor.js
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

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

module.exports = {
  cleanupContent,
  createOutputFiles,
  processFile,
  saveOutputFiles,
};
