const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const args = process.argv.slice(2);

if (args.length < 2) {
    console.error("Usage: node package-fpapp.js <input-dir> <output-zip> [compression-level]");
    console.error("  compression-level: 0 (none/fastest) to 9 (maximum/slowest), default: 0");
    process.exit(1);
}

const inputDir = path.resolve(args[0]);
const outputPath = path.resolve(args[1]);
const compressionLevel = args[2] !== undefined ? parseInt(args[2], 10) : 0;

if (isNaN(compressionLevel) || compressionLevel < 0 || compressionLevel > 9) {
    console.error("Error: Compression level must be a number between 0 and 9");
    process.exit(1);
}

// Validate input directory exists
if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory does not exist: ${inputDir}`);
    process.exit(1);
}

// Validate frontpanel-app.json exists in input directory
const manifestPath = path.join(inputDir, "frontpanel-app.json");
if (!fs.existsSync(manifestPath)) {
    console.error(`Error: frontpanel-app.json not found in ${inputDir}`);
    console.error("This file is required for FrontPanel Platform applications.");
    process.exit(1);
}

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Create the zip archive
const output = fs.createWriteStream(outputPath);
const archive = archiver("zip", {
    zlib: { level: compressionLevel }
});

output.on("close", () => {
    const sizeKB = (archive.pointer() / 1024).toFixed(2);
    console.log(`Created ${outputPath} (${sizeKB} KB)`);
});

archive.on("error", (err) => {
    console.error(`Error creating archive: ${err.message}`);
    process.exit(1);
});

archive.on("warning", (err) => {
    if (err.code === "ENOENT") {
        console.warn(`Warning: ${err.message}`);
    } else {
        throw err;
    }
});

archive.pipe(output);

// Add all contents from input directory to the archive root
archive.directory(inputDir, false);

archive.finalize();
