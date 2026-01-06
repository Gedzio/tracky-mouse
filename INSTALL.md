# How to Install and Run Tracky Mouse

This guide explains how to build, run, and install Tracky Mouse from source code.

## Prerequisites

- [Node.js](https://nodejs.org/) (installed and available in your terminal)

## Quick Start

1.  **Install Dependencies**  
    Run this command once to check for and install all necessary packages:

    ```bash
    npm install
    ```

2.  **Start Application (Debug Mode)**  
    To run the app immediately for testing or development:

    ```bash
    npm start
    ```

3.  **Build Installer**  
    To create a standalone `.exe` installer (like the one you download):
    ```bash
    npm run make
    ```
    - The build process takes a few minutes.
    - **Installer Location:** After it finishes, check this folder:
      `out\make\squirrel.windows\x64\Tracky Mouse-1.2.0 Setup.exe`

## Troubleshooting

- If `npm install` fails, try deleting the `node_modules` folder and running it again.
- Ensure no other instance of Tracky Mouse is running when you try to build.
