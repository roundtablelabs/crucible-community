#!/usr/bin/env node

/**
 * Copy PDF.js worker file from node_modules to public folder.
 * 
 * This script checks two possible locations for the worker file:
 * 1. Primary: node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs (nested)
 * 2. Fallback: node_modules/pdfjs-dist/build/pdf.worker.min.mjs (root level)
 * 
 * The worker file is copied to public/pdf.worker.min.mjs for use by react-pdf components.
 */

const fs = require('fs');
const path = require('path');

// Get the directory where this script is located (frontend/scripts)
const scriptDir = __dirname;
// Get the frontend directory (parent of scripts)
const frontendDir = path.dirname(scriptDir);
// Define source paths (relative to frontend directory)
const primarySourcePath = path.join(frontendDir, 'node_modules', 'react-pdf', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const fallbackSourcePath = path.join(frontendDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
// Define destination path
const publicDir = path.join(frontendDir, 'public');
const destPath = path.join(publicDir, 'pdf.worker.min.mjs');

/**
 * Check if a file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Copy file from source to destination
 */
function copyFile(sourcePath, destPath) {
  try {
    fs.copyFileSync(sourcePath, destPath);
    return true;
  } catch (error) {
    console.error(`Error copying file: ${error.message}`);
    return false;
  }
}

/**
 * Ensure directory exists, create if it doesn't
 */
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
    return true;
  } catch (error) {
    console.error(`Error creating directory: ${error.message}`);
    return false;
  }
}

// Main execution
function main() {
  console.log('Copying PDF.js worker file...');
  
  // Check primary location (nested)
  if (fileExists(primarySourcePath)) {
    console.log(`Found worker file at: ${primarySourcePath}`);
    
    // Ensure public directory exists
    if (!ensureDirectoryExists(publicDir)) {
      console.error('Failed to create public directory');
      process.exit(1);
    }
    
    // Copy the file
    if (copyFile(primarySourcePath, destPath)) {
      console.log(`Successfully copied worker file to: ${destPath}`);
      process.exit(0);
    } else {
      console.error('Failed to copy worker file');
      process.exit(1);
    }
  }
  // Check fallback location (root level)
  else if (fileExists(fallbackSourcePath)) {
    console.log(`Found worker file at: ${fallbackSourcePath}`);
    
    // Ensure public directory exists
    if (!ensureDirectoryExists(publicDir)) {
      console.error('Failed to create public directory');
      process.exit(1);
    }
    
    // Copy the file
    if (copyFile(fallbackSourcePath, destPath)) {
      console.log(`Successfully copied worker file to: ${destPath}`);
      process.exit(0);
    } else {
      console.error('Failed to copy worker file');
      process.exit(1);
    }
  }
  // Neither location found
  else {
    console.error('PDF.js worker file not found in either location:');
    console.error(`  Primary: ${primarySourcePath}`);
    console.error(`  Fallback: ${fallbackSourcePath}`);
    console.error('');
    console.error('Please ensure react-pdf is installed: npm install react-pdf');
    process.exit(1);
  }
}

// Run the script
main();

