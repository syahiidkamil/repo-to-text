// utils/contentProcessor.js
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { Document, Packer, Paragraph, TextRun } = require("docx");

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
        // Both txt and docx use txtContents initially
        txtContents.push("");
      }
    }
  } else {
    if (outputFormat === "pdf") {
      docs.push(new PDFDocument());
      docs[0].pipe(fs.createWriteStream(`${outputPath}.pdf`));
    } else {
      // Both txt and docx use txtContents initially
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
  currentChunk,
  pathType = "relative"
) {
  try {
    let content = fs.readFileSync(file, "utf8");
    const filePath = pathType === "absolute" ? file : path.relative(localPath, file);
    const fileExt = path.extname(file).toLowerCase();

    if (fileExt === ".xml" || fileExt === ".json") {
      content = cleanupContent(content, fileExt);
    }

    if (outputFormat === "pdf") {
      docs[currentChunk].fontSize(14).text(filePath, { underline: true });
      docs[currentChunk].fontSize(10).text(content);
      docs[currentChunk].addPage();
    } else {
      // Both txt and docx use same text processing
      txtContents[currentChunk] += `File: ${filePath}\n\n${content}\n\n`;
    }
  } catch (error) {
    console.warn(`Skipping file ${file}: ${error.message}`);
  }
}

async function convertTextToDocx(text, outputPath) {
  // Simple approach: each line becomes a paragraph with default formatting
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: text.split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line })],
            })
        ),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

async function saveOutputFiles(
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
  } else if (outputFormat === "docx") {
    // Convert txt content to docx
    for (let i = 0; i < txtContents.length; i++) {
      const fileName = chunkMode
        ? `${path.basename(outputPath)}_${i + 1}.docx`
        : `${path.basename(outputPath)}.docx`;
      const fullPath = path.join(path.dirname(outputPath), fileName);

      await convertTextToDocx(txtContents[i], fullPath);
      console.log(
        `DOCX ${
          chunkMode ? `chunk ${i + 1}` : "file"
        } created successfully: ${fullPath}`
      );
    }
  } else {
    // txt format
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
  convertTextToDocx,
};
