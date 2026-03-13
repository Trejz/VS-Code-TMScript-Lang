# TMscript Language Support for VS Code

Language support for **Techman Robot Script (TMscript)**. This extension is primarily designed for use with the **Script Node** in TMflow projects. Standalone script projects are also supported, but some features are still in development.

## Features

### Syntax Highlighting
Basic syntax highlighting for TMscript Language including:
- Keywords, control flow statements, and operators
- Data types (`int`, `float`, `double`, `string`, `byte`, `bool`, etc.)
- Built-in functions and classes

### IntelliSense
- **Autocomplete** — Suggestions for functions, classes, methods, and keywords as you type
- **Hover Documentation** — Hover over any function or type to see its documentation, parameters, and return type
- **Signature Help** — Parameter hints when calling functions

### Supported TMscript Features
Comprehensive support for TMscript 2.24:

## Installation

### From VSIX
1. Download the `.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` and run **Extensions: Install from VSIX...**
4. Select the downloaded file

### From Marketplace
Search for "Techman Robot Script" in the VS Code Extensions view.

### For Development

If you want to contribute or modify the extension:

1. **Clone the repository**
   ```bash
   git clone https://github.com/Trejz/VS-Code-TMScript-Lang.git
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile the TypeScript code**
   ```bash
   npm run compile
   ```

4. **Test the extension**
   - Press `F5` in VS Code to open a new Extension Development Host window
   - Open a `.tms` file to test the extension features

5. **Watch for changes** (optional, for active development)
   ```bash
   npm run watch
   ```

6. **Package the extension**
   ```bash
   npm install -g @vscode/vsce   # Install vsce globally (one-time)
   vsce package                   # Creates a .vsix file
   ```


## Usage

1. Open or create a `.tms` file
2. Start writing TMscript code
3. Use `Ctrl+Space` to trigger autocomplete suggestions
4. Hover over functions to view documentation


## File Association

The extension automatically associates with `.tms` files, which is not the Filetype provided by Techman. To manually set the language mode:
1. Click the language indicator in the bottom-right corner of VS Code
2. Select **TMScript** from the list

## Requirements

- VS Code 1.109.0 or higher

## Contributing

Contributions are welcome! Visit the [GitHub repository](https://github.com/Trejz/VS-Code-TMScript-Lang) to report issues or submit pull requests.

## License

This extension is licensed under the [MIT License](LICENSE.md).

---

**Note:** This extension is not officially affiliated with Techman Robot Inc. TMscript documentation is based on TMscript 2.24.

