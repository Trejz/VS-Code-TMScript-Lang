import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// Helper to get return type for a specific signature index
// Supports both string (same for all) and array (per-signature) return types
function getReturnType(functionInfo: any, signatureIndex: number = 0): string {
	const ret = functionInfo.return;
	if (Array.isArray(ret)) {
		return ret[signatureIndex] ?? ret[0] ?? "void";
	}
	return ret ?? "void";
}

// Helper to get a summary of all return types (for detail display)
function getReturnTypeSummary(functionInfo: any): string {
	const ret = functionInfo.return;
	if (Array.isArray(ret)) {
		const unique = [...new Set(ret.filter((r: string) => r))];
		return unique.join(" | ");
	}
	return ret ?? "void";
}

// Shared helper to remove comments from a line while tracking block comment state.
// Returns the processed text (or null if the line is entirely within a block comment)
// along with the updated inBlockComment flag.
function removeCommentsFromLine(
	line: string,
	inBlockComment: boolean
): { text: string | null; inBlockComment: boolean } {
	let text = line;
	// Handle being inside an existing block comment
	if (inBlockComment) {
		const endIndex = text.indexOf("*/");
		if (endIndex !== -1) {
			// End of block comment found; mask the commented portion with spaces
			inBlockComment = false;
			text = " ".repeat(endIndex + 2) + text.substring(endIndex + 2);
		} else {
			// Entire line is still within block comment; skip it
			return { text: null, inBlockComment };
		}
	}
	// Remove inline block comments on the same line, preserving length with spaces
	text = text.replace(/\/\*.*?\*\//g, match => " ".repeat(match.length));
	// Detect start of a new block comment and keep only the code before it
	const blockStartIndex = text.indexOf("/*");
	if (blockStartIndex !== -1) {
		inBlockComment = true;
		text = text.substring(0, blockStartIndex);
	}
	// Strip line comments
	const lineCommentIndex = text.indexOf("//");
	if (lineCommentIndex !== -1) {
		text = text.substring(0, lineCommentIndex);
	}
	return { text, inBlockComment };
}

// Interface for user-defined function info
interface UserDefinedFunction {
	returnType: string;
	parameters: string[];
	lineNumber: number;
}
// Cache for user-defined functions per document URI and version
const userDefinedFunctionCache: Map<string, { version: number; functions: Map<string, UserDefinedFunction> }> = new Map();

// Helper function to parse user-defined functions from a document
function parseUserDefinedFunctions(document: vscode.TextDocument): Map<string, UserDefinedFunction> {
    const cacheKey = document.uri.toString();
 	const cached = userDefinedFunctionCache.get(cacheKey);
 	if (cached && cached.version === document.version) {
 		// Return a shallow copy to avoid callers mutating the cached Map
 		return new Map(cached.functions);
 	}
	const functions: Map<string, UserDefinedFunction> = new Map();
	
	// Track multi-line comment state
	let inBlockComment = false;
	
	for (let i = 0; i < document.lineCount; i++) {
		let line = document.lineAt(i).text;
        // Handle comments (block and line) with shared helper
 		const commentResult = removeCommentsFromLine(line, inBlockComment);
 		inBlockComment = commentResult.inBlockComment;
 		if (commentResult.text === null) {
 			continue;
		}
		
		line = commentResult.text;

		// Match function definition pattern: returnType functionName(params)
		// Pattern: type name(params) where type can be void, string, int, bool, float, double, byte, or custom types
		// Also handles arrays like string[]
		// Allows optional opening brace on same line: void myFunc() { ... }
		const funcMatch = line.match(/^\s*(void|string|int|byte|float|double|bool|[A-Z]\w*)(\[\])?\s+(\w+)\s*\(([^)]*)\)\s*\{?/);
		if (funcMatch) {
			const returnType = funcMatch[1] + (funcMatch[2] || "");
			const functionName = funcMatch[3];
			const paramsString = funcMatch[4].trim();
			
			// Parse parameters
			const parameters: string[] = [];
			if (paramsString) {
				// Split by comma and parse each parameter
				const paramParts = paramsString.split(",");
				for (const param of paramParts) {
					const trimmed = param.trim();
					if (trimmed) {
						// Match parameter: type name (with optional [])
						const paramMatch = trimmed.match(/^((?:string|int|byte|float|double|bool|[A-Z]\w*)(?:\[\])?)\s+(\w+)$/);
						if (paramMatch) {
							parameters.push(`${paramMatch[1]} ${paramMatch[2]}`);
						} else {
							// Keep as-is if parsing fails
							parameters.push(trimmed);
						}
					}
				}
			}
			
			functions.set(functionName, {
				returnType,
				parameters,
				lineNumber: i
			});
		}
	}
	// Store in cache for this document URI and version
 	userDefinedFunctionCache.set(cacheKey, { version: document.version, functions });
 	// Return a shallow copy to preserve the previous behavior
 	return new Map(functions);
}

export function activate(context: vscode.ExtensionContext) {
	// Load functions data
	const functionsPath = path.join(context.extensionPath, "data", "functions.json");
	const functionsData = JSON.parse(fs.readFileSync(functionsPath, "utf8"));

	// Register completion provider
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		"tmscript", // language id
		{
			provideCompletionItems(document, position, token) {
				const completionItems: vscode.CompletionItem[] = [];

				// Create completion items for each function (skip "types" and "parameterizedObjects")
				for (const [functionName, functionInfo] of Object.entries(functionsData)) {
					if (functionName === "types" || functionName === "parameterizedObjects") continue; // Skip non-function sections

					const item = new vscode.CompletionItem(
						functionName,
						vscode.CompletionItemKind.Function
					);

					// Build documentation with all signatures
					const signatures = (functionInfo as any).signatures.map((sig: string[], idx: number) => {
						const params = sig.join(", ");
						return `${functionName}(${params}) → ${getReturnType(functionInfo, idx)}`;
					}).join("\n");

					const documentation = new vscode.MarkdownString(
						`${(functionInfo as any).documentation}\n\n**Signatures:**\n\`\`\`\n${signatures}\n\`\`\``
					);

					item.documentation = documentation;
					item.detail = `Returns: ${getReturnTypeSummary(functionInfo)}`;

					// Add signature help with all overloads - include parentheses and position cursor inside
					item.insertText = new vscode.SnippetString(`${functionName}($0)`);
					item.command = { command: "editor.action.triggerParameterHints", title: "Trigger Parameter Hints" };

					completionItems.push(item);
				}

				// Add custom types to completion
				if (functionsData.types) {
					for (const [typeName, typeInfo] of Object.entries(functionsData.types)) {
						const item = new vscode.CompletionItem(
							typeName,
							vscode.CompletionItemKind.Class
						);
						item.documentation = new vscode.MarkdownString((typeInfo as any).description);
						item.detail = `Custom Type`;
						item.insertText = typeName;
						completionItems.push(item);
					}
				}

				// Add defined variables to completion
				for (let i = 0; i < document.lineCount; i++) {
					const line = document.lineAt(i).text;
					
					// Match variable declarations: type variableName = ... (including arrays like string[])
					const varDeclMatch = line.match(/\b((?:string|int|byte|float|double|bool|[A-Z]\w+)(?:\[\])?)\s+(\w+)\s*=/);
					if (varDeclMatch) {
						const varType = varDeclMatch[1];
						const varName = varDeclMatch[2];
						
						const item = new vscode.CompletionItem(
							varName,
							vscode.CompletionItemKind.Variable
						);
						item.detail = `Variable: ${varType}`;
						item.insertText = varName;
						completionItems.push(item);
					}
				}

				// Add keywords to completion
				const keywords: string[] = ["if", "else", "while", "for", "do", "switch", "case", "break", "continue", "return", "default", "void", "define", "closestop", "errorstop", "true", "false", "main", "newline"];
				for (const keyword of keywords) {
					const item = new vscode.CompletionItem(
						keyword,
						vscode.CompletionItemKind.Keyword
					);
					item.detail = "Keyword";
					item.insertText = keyword;
					completionItems.push(item);
				}

				// Add data types to completion
				const dataTypes = ["string", "int", "byte", "float", "double", "bool", "string[]", "int[]", "byte[]", "float[]", "double[]", "bool[]"];
				for (const dataType of dataTypes) {
					const item = new vscode.CompletionItem(
						dataType,
						vscode.CompletionItemKind.TypeParameter
					);
					item.detail = "Data Type";
					item.insertText = dataType;
					completionItems.push(item);
				}

				// Add user-defined functions to completion
				const userDefinedFunctions = parseUserDefinedFunctions(document);
				for (const [funcName, funcInfo] of userDefinedFunctions) {
					const item = new vscode.CompletionItem(
						funcName,
						vscode.CompletionItemKind.Function
					);
					
					const signature = `${funcName}(${funcInfo.parameters.join(", ")}) → ${funcInfo.returnType}`;
					const documentation = new vscode.MarkdownString(
						`**User-defined function**\n\n**Signature:**\n\`\`\`\n${signature}\n\`\`\``
					);
					
					item.documentation = documentation;
					item.detail = `Returns: ${funcInfo.returnType}`;
					item.insertText = new vscode.SnippetString(`${funcName}($0)`);
					item.command = { command: "editor.action.triggerParameterHints", title: "Trigger Parameter Hints" };
					
					completionItems.push(item);
				}

				// Add function parameters if cursor is inside a function body
				// Find which function we're in by tracking braces
				let currentFunctionParams: Array<{name: string, type: string}> | null = null;
				let braceDepth = 0;
				let functionStartBraceDepth = 0;
				let inBlockComment = false;
				
				for (let i = 0; i <= position.line; i++) {
					let line = document.lineAt(i).text;
					
					// Handle block comments
					if (inBlockComment) {
						const endIndex = line.indexOf("*/");
						if (endIndex !== -1) {
							inBlockComment = false;
							line = " ".repeat(endIndex + 2) + line.substring(endIndex + 2);
						} else {
							continue;
						}
					}
					line = line.replace(/\/\*.*?\*\//g, match => " ".repeat(match.length));
					const blockStartIndex = line.indexOf("/*");
					if (blockStartIndex !== -1) {
						inBlockComment = true;
						line = line.substring(0, blockStartIndex);
					}
					const lineCommentIndex = line.indexOf("//");
					if (lineCommentIndex !== -1) {
						line = line.substring(0, lineCommentIndex);
					}
					
					// Check for function definition
					const funcDefMatch = line.match(/^\s*(void|string|int|byte|float|double|bool|[A-Z]\w*)(\[\])?\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/);
					if (funcDefMatch && currentFunctionParams === null) {
						const paramsString = funcDefMatch[4].trim();
						currentFunctionParams = [];
						
						if (paramsString) {
							const paramParts = paramsString.split(",");
							for (const param of paramParts) {
								const trimmed = param.trim();
								const paramMatch = trimmed.match(/^((?:string|int|byte|float|double|bool|[A-Z]\w*)(?:\[\])?)\s+(\w+)$/);
								if (paramMatch) {
									currentFunctionParams.push({ type: paramMatch[1], name: paramMatch[2] });
								}
							}
						}
						functionStartBraceDepth = braceDepth;
					}
					
					// Track braces
					const lineWithoutStrings = line.replace(/"[^"]*"/g, match => " ".repeat(match.length));
					for (const char of lineWithoutStrings) {
						if (char === "{") {
							braceDepth++;
						} else if (char === "}") {
							braceDepth--;
							if (currentFunctionParams !== null && braceDepth === functionStartBraceDepth) {
								currentFunctionParams = null;
							}
						}
					}
				}
				
				// Add parameters as completion items if we're inside a function
				if (currentFunctionParams !== null) {
					for (const param of currentFunctionParams) {
						const item = new vscode.CompletionItem(
							param.name,
							vscode.CompletionItemKind.Variable
						);
						item.detail = `Parameter: ${param.type}`;
						item.insertText = param.name;
						completionItems.push(item);
					}
				}

				return completionItems;
			}
		},
		// Trigger completion on function name start (optional: add more trigger characters)
	);

	context.subscriptions.push(completionProvider);

	// Register completion provider for parameterized objects (Point[...].X, Base[...].Y, etc.)
	const parameterizedObjectCompletionProvider = vscode.languages.registerCompletionItemProvider(
		"tmscript",
		{
			provideCompletionItems(document, position, token) {
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);

				// Match parameterized object patterns with index: Point[...]. Base[...]. TCP[...]. VPoint[...]. IO[...]. FT[...]. Robot[...].
				const indexedMatch = textBeforePosition.match(/(Point|Base|TCP|VPoint|IO|FT|Robot)\s*\[[^\]]+\]\s*\.$/);
				// Match Env. (no index required)
				const directMatch = textBeforePosition.match(/\bEnv\.$/);

				const objectName = indexedMatch ? indexedMatch[1] : (directMatch ? "Env" : null);
				
				if (!objectName || !functionsData.parameterizedObjects) {
					return [];
				}

				const paramObj = functionsData.parameterizedObjects[objectName];
				if (!paramObj || !paramObj.attributes) {
					return [];
				}

				const completionItems: vscode.CompletionItem[] = [];

				for (const [attrName, attrInfo] of Object.entries(paramObj.attributes)) {
					const item = new vscode.CompletionItem(
						attrName,
						vscode.CompletionItemKind.Property
					);
					const mode = (attrInfo as any).mode === "R" ? "Read-only" : "Read/Write";
					item.detail = `${(attrInfo as any).type} (${mode})`;
					item.documentation = new vscode.MarkdownString((attrInfo as any).description);
					item.insertText = attrName;
					completionItems.push(item);
				}

				return completionItems;
			}
		},
		"."
	);

	context.subscriptions.push(parameterizedObjectCompletionProvider);

	// Register completion provider for parameterized object names (Point, Base, TCP, etc.)
	const parameterizedObjectNameCompletionProvider = vscode.languages.registerCompletionItemProvider(
		"tmscript",
		{
			provideCompletionItems(document, position, token) {
				if (!functionsData.parameterizedObjects) {
					return [];
				}

				// Don't suggest object names after a parameterized object pattern (e.g., Point[...].)
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);
				if (/(Point|Base|TCP|VPoint|IO|FT|Robot)\s*\[[^\]]+\]\s*\.$/.test(textBeforePosition) ||
					/\bEnv\.$/.test(textBeforePosition)) {
					return [];
				}

				const completionItems: vscode.CompletionItem[] = [];

				for (const [objName, objInfo] of Object.entries(functionsData.parameterizedObjects)) {
					const item = new vscode.CompletionItem(
						objName,
						vscode.CompletionItemKind.Variable
					);
					item.documentation = new vscode.MarkdownString((objInfo as any).description);
					
					// Add appropriate snippet based on index type
					if ((objInfo as any).indexType === "none") {
						item.insertText = new vscode.SnippetString(`${objName}.`);
						item.detail = `Parameterized Object (${objName}.attribute)`;
					} else if ((objInfo as any).indexType === "int") {
						item.insertText = new vscode.SnippetString(`${objName}[\${1:0}].`);
						item.detail = `Parameterized Object (${objName}[int].attribute)`;
					} else {
						item.insertText = new vscode.SnippetString(`${objName}["\${1:name}"].`);
						item.detail = `Parameterized Object (${objName}["name"].attribute)`;
					}
					
					item.command = { command: "editor.action.triggerSuggest", title: "Trigger Suggest" };
					completionItems.push(item);
				}

				return completionItems;
			}
		}
	);

	context.subscriptions.push(parameterizedObjectNameCompletionProvider);

	// Register attribute completion provider for custom types
	const attributeCompletionProvider = vscode.languages.registerCompletionItemProvider(
		"tmscript",
		{
			provideCompletionItems(document, position, token) {
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);

				const dotMatch = textBeforePosition.match(/(\w+)\.$/);
				if (!dotMatch) {
					return [];
				}

				const varName = dotMatch[1];

				// Parse document to find variable type
				const variableMap: Map<string, string> = new Map();
				
				for (let i = 0; i < document.lineCount; i++) {
					const varLine = document.lineAt(i).text;
					
					// Match custom types (TBase, TRobot, etc.)
					const customMatch = varLine.match(/\b([A-Z]\w+)\s+(\w+)\s*(?:=|;)/);
					if (customMatch && functionsData.types && functionsData.types[customMatch[1]]) {
						const type = customMatch[1];
						const varNameFound = customMatch[2];
						variableMap.set(varNameFound, type);
					}
				}

				const varType = variableMap.get(varName);
				if (!varType || !functionsData.types || !functionsData.types[varType]) {
					return [];
				}

				const typeInfo = functionsData.types[varType];
				const completionItems: vscode.CompletionItem[] = [];

				// Add attributes as completion items
				if ((typeInfo as any).attributes) {
					for (const [attrName, attrType] of Object.entries((typeInfo as any).attributes)) {
						const item = new vscode.CompletionItem(
							attrName,
							vscode.CompletionItemKind.Property
						);
						item.detail = `Type: ${attrType}`;
						item.insertText = attrName;
						completionItems.push(item);
					}
				}

				// Add methods as completion items
				if ((typeInfo as any).methods) {
					for (const [methodName, methodInfo] of Object.entries((typeInfo as any).methods)) {
						const item = new vscode.CompletionItem(
							methodName,
							vscode.CompletionItemKind.Method
						);
						const params = (methodInfo as any).parameters.join(", ");
						item.detail = `Returns: ${(methodInfo as any).return}`;
						item.documentation = new vscode.MarkdownString((methodInfo as any).documentation);
						item.insertText = `${methodName}()`;
						item.command = { command: "editor.action.triggerParameterHints", title: "Trigger Parameter Hints" };
						completionItems.push(item);
					}
				}

				return completionItems;
			}
		},
		"."
	);

	context.subscriptions.push(attributeCompletionProvider);

	// Register signature help provider for parameter hints
	const signatureProvider = vscode.languages.registerSignatureHelpProvider(
		"tmscript",
		{
			provideSignatureHelp(document, position, token) {
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);

				// Find the function name before the opening parenthesis
				const functionMatch = textBeforePosition.match(/(\w+)\s*\(\s*$/);
				if (!functionMatch) {
					return null;
				}

				const functionName = functionMatch[1];
				const functionInfo = functionsData[functionName];

				if (functionInfo) {
					// Build signature information from functionsData
					const signatures = (functionInfo.signatures as string[][]).map((sig, idx) => {
						const signatureLabel = `${functionName}(${sig.join(", ")}) → ${getReturnType(functionInfo, idx)}`;
						
						const signature = new vscode.SignatureInformation(
							signatureLabel,
							functionInfo.documentation
						);
						signature.parameters = sig.map(p => new vscode.ParameterInformation(p));

						return signature;
					});

					const help = new vscode.SignatureHelp();
					help.signatures = signatures;
					help.activeSignature = 0;
					help.activeParameter = 0;

					return help;
				}

				// Check if it's a user-defined function
				const userDefinedFunctions = parseUserDefinedFunctions(document);
				const userFuncInfo = userDefinedFunctions.get(functionName);
				
				if (userFuncInfo) {
					const signatureLabel = `${functionName}(${userFuncInfo.parameters.join(", ")}) → ${userFuncInfo.returnType}`;
					
					const signature = new vscode.SignatureInformation(
						signatureLabel,
						"User-defined function"
					);
					signature.parameters = userFuncInfo.parameters.map(p => new vscode.ParameterInformation(p));

					const help = new vscode.SignatureHelp();
					help.signatures = [signature];
					help.activeSignature = 0;
					help.activeParameter = 0;

					return help;
				}

				return null;
			}
		},
		"(",
		","
	);

	context.subscriptions.push(signatureProvider);

	// Register method signature help provider for custom types
	const methodSignatureProvider = vscode.languages.registerSignatureHelpProvider(
		"tmscript",
		{
			provideSignatureHelp(document, position, token) {
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);

				// Find method call pattern: varName.methodName(
				const methodMatch = textBeforePosition.match(/(\w+)\.(\w+)\s*\(\s*$/);
				if (!methodMatch) {
					return null;
				}

				const varName = methodMatch[1];
				const methodName = methodMatch[2];

				// Parse document to find variable type
				const variableMap: Map<string, string> = new Map();
				
				for (let i = 0; i < document.lineCount; i++) {
					const varLine = document.lineAt(i).text;
					const customMatch = varLine.match(/\b([A-Z]\w+)\s+(\w+)\s*(?:=|;)/);
					if (customMatch && functionsData.types && functionsData.types[customMatch[1]]) {
						variableMap.set(customMatch[2], customMatch[1]);
					}
				}

				const varType = variableMap.get(varName);
				if (!varType || !functionsData.types || !functionsData.types[varType]) {
					return null;
				}

				const typeInfo = functionsData.types[varType];
				const methodInfo = typeInfo.methods ? typeInfo.methods[methodName] : null;

				if (!methodInfo) {
					return null;
				}

				const signature = new vscode.SignatureInformation(
					`${methodName}(${(methodInfo as any).parameters.join(", ")}) → ${(methodInfo as any).return}`,
					(methodInfo as any).documentation
				);
				signature.parameters = ((methodInfo as any).parameters as string[]).map(p => 
					new vscode.ParameterInformation(p)
				);

				const help = new vscode.SignatureHelp();
				help.signatures = [signature];
				help.activeSignature = 0;
				help.activeParameter = 0;

				return help;
			}
		},
		"(",
		","
	);

	context.subscriptions.push(methodSignatureProvider);

	// Register hover provider for variable type information
	const hoverProvider = vscode.languages.registerHoverProvider(
		"tmscript",
		{
			provideHover(document, position, token) {
				// Get word at cursor position
				const wordRange = document.getWordRangeAtPosition(position);
				if (!wordRange) {
					return null;
				}

				const word = document.getText(wordRange);
				const line = document.lineAt(position).text;
				const charBefore = line[wordRange.start.character - 1];

				// First, parse all variable declarations
				const variableMap: Map<string, {type: string, value: string}> = new Map();
				
				for (let i = 0; i < document.lineCount; i++) {
					const varLine = document.lineAt(i).text;
					
					// Match built-in types (string, int, byte, float, double, bool)
					const builtInMatch = varLine.match(/\b(string|int|byte|float|double|bool)(?:\[\])?\s+(\w+)\s*=\s*(.+?)(?:;|$)/);
					if (builtInMatch) {
						const type = builtInMatch[1];
						const varName = builtInMatch[2];
						const value = builtInMatch[3].trim();
						const isArray = varLine.includes("[]");
						const fullType = isArray ? `${type}[]` : type;
						variableMap.set(varName, { type: fullType, value });
						continue;
					}

					// Match custom types (TBase, TRobot, etc.) - start with uppercase
					const customMatch = varLine.match(/\b([A-Z]\w+)\s+(\w+)\s*(?:=\s*(.+?))?(?:;|$)/);
					if (customMatch && functionsData.types && functionsData.types[customMatch[1]]) {
						const type = customMatch[1];
						const varName = customMatch[2];
						const value = customMatch[3]?.trim() || "";
						variableMap.set(varName, { type, value });
					}
				}

				// Check if this is an attribute access (e.g., base.Value)
				if (charBefore === ".") {
					const beforeDot = line.substring(0, wordRange.start.character - 1).trim();
					
					// Check for parameterized object attribute access (Point[...].X, Robot[0].Joint, Env.AppVersion, etc.)
					const indexedParamMatch = beforeDot.match(/(Point|Base|TCP|VPoint|IO|FT|Robot)\s*\[[^\]]+\]\s*$/);
					const directParamMatch = beforeDot.match(/\bEnv$/);
					const paramObjName = indexedParamMatch ? indexedParamMatch[1] : (directParamMatch ? "Env" : null);
					
					if (paramObjName && functionsData.parameterizedObjects && functionsData.parameterizedObjects[paramObjName]) {
						const paramObj = functionsData.parameterizedObjects[paramObjName];
						const attrInfo = paramObj.attributes ? paramObj.attributes[word] : null;
						
						if (attrInfo) {
							const mode = (attrInfo as any).mode === "R" ? "Read-only" : "Read/Write";
							const markdown = new vscode.MarkdownString(
								`**${paramObjName}.${word}**\n\n${(attrInfo as any).description}\n\n**Type:** \`${(attrInfo as any).type}\`\n\n**Mode:** ${mode}`
							);
							return new vscode.Hover(markdown);
						}
					}

					const varName = beforeDot.split(/[\s\(\)\[\]\{\},;]/).pop();

					if (varName && variableMap.has(varName)) {
						const varInfo = variableMap.get(varName);
						const varType = varInfo!.type;
						
						if (functionsData.types && functionsData.types[varType]) {
							const typeInfo = functionsData.types[varType];
							
							// Check for attribute
							const attributeType = typeInfo.attributes ? typeInfo.attributes[word] : null;
							if (attributeType) {
								const markdown = new vscode.MarkdownString(
									`**Attribute:** \`${word}\`\n\n**Type:** \`${attributeType}\``
								);
								return new vscode.Hover(markdown);
							}
							
							// Check for method
							const methodInfo = typeInfo.methods ? typeInfo.methods[word] : null;
							if (methodInfo) {
								const params = (methodInfo as any).parameters.join(", ");
								const signature = `${word}(${params}) → ${(methodInfo as any).return}`;
								const markdown = new vscode.MarkdownString(
									`**Method:** \`${word}\`\n\n${(methodInfo as any).documentation}\n\n**Signature:**\n\`\`\`\n${signature}\n\`\`\``
								);
								return new vscode.Hover(markdown);
							}
						}
					}
					return null;
				}

				// Check if word is a function (skip "types" key)
				if (functionsData[word] && word !== "types" && (functionsData[word] as any).signatures) {
					const functionInfo = functionsData[word];
					const signatures = (functionInfo.signatures as string[][]).map((sig, idx) => {
						const params = sig.join(", ");
						return `${word}(${params}) → ${getReturnType(functionInfo, idx)}`;
					}).join("\n");

					const markdown = new vscode.MarkdownString(
						`**${word}**\n\n${functionInfo.documentation}\n\n**Signatures:**\n\`\`\`\n${signatures}\n\`\`\``
					);
					return new vscode.Hover(markdown);
				}

				// Check if word is a custom type (e.g., hovering over TBase)
				if (functionsData.types && functionsData.types[word]) {
					const typeInfo = functionsData.types[word];
					let markdownContent = `**Type:** \`${word}\`\n\n${(typeInfo as any).description}`;
					
					if ((typeInfo as any).constructor) {
						const constructors = Array.isArray((typeInfo as any).constructor) 
							? (typeInfo as any).constructor.join('\n') 
							: (typeInfo as any).constructor;
						markdownContent += `\n\n**Constructor:**\n\`\`\`\n${constructors}\n\`\`\``;
					}
					
					const markdown = new vscode.MarkdownString(markdownContent);
					return new vscode.Hover(markdown);
				}

				// Check if word is a parameterized object (Point, Base, TCP, VPoint, IO, Robot, FT, Env)
				if (functionsData.parameterizedObjects && functionsData.parameterizedObjects[word]) {
					const paramObj = functionsData.parameterizedObjects[word];
					let markdownContent = `**Parameterized Object:** \`${word}\`\n\n${(paramObj as any).description}`;
					
					// List available attributes
					if ((paramObj as any).attributes) {
						const attrs = Object.entries((paramObj as any).attributes).map(([name, info]) => {
							const mode = (info as any).mode === "R" ? "R" : "R/W";
							return `- \`${name}\` (${(info as any).type}, ${mode})`;
						}).join("\n");
						markdownContent += `\n\n**Attributes:**\n${attrs}`;
					}
					
					const markdown = new vscode.MarkdownString(markdownContent);
					return new vscode.Hover(markdown);
				}

				// Check if the word at cursor is a known variable
				if (variableMap.has(word)) {
					const varInfo = variableMap.get(word);
					let markdownContent = `**Type:** \`${varInfo!.type}\``;
					
					if (varInfo!.value) {
						markdownContent += `\n\n**Value:** \`${varInfo!.value}\``;
					}
					
					const markdown = new vscode.MarkdownString(markdownContent);
					return new vscode.Hover(markdown);
				}

				// Check if word is a user-defined function
				const userDefinedFunctions = parseUserDefinedFunctions(document);
				const userFuncInfo = userDefinedFunctions.get(word);
				if (userFuncInfo) {
					const signature = `${word}(${userFuncInfo.parameters.join(", ")}) → ${userFuncInfo.returnType}`;
					const markdown = new vscode.MarkdownString(
						`**User-defined function**\n\n**Signature:**\n\`\`\`\n${signature}\n\`\`\`\n\n*Defined on line ${userFuncInfo.lineNumber + 1}*`
					);
					return new vscode.Hover(markdown);
				}

				return null;
			}
		}
	);

	context.subscriptions.push(hoverProvider);

	// Register diagnostic provider for undefined variables and non-existent functions
	const diagnosticCollection = vscode.languages.createDiagnosticCollection("tmscript");
	context.subscriptions.push(diagnosticCollection);

	// Helper function to infer the type of an expression
	const inferExpressionType = (expr: string): string | null => {
		const trimmed = expr.trim();
		
		// Remove trailing semicolon if present
		const cleanExpr = trimmed.replace(/;$/, "").trim();
		
		// Check if it's a string literal
		if (/^"[^"]*"$/.test(cleanExpr)) {
			return "string";
		}
		
		// Check if it's a boolean literal
		if (cleanExpr === "true" || cleanExpr === "false") {
			return "bool";
		}
		
		// Check if it's a float/double literal (has decimal point)
		if (/^-?\d+\.\d+$/.test(cleanExpr)) {
			return "float";
		}
		
		// Check if it's an integer literal
		if (/^-?\d+$/.test(cleanExpr)) {
			return "int";
		}
		
		// Check if it's a parameterized object attribute access
		// Match: Point["name"].Attr, Base["name",0].Attr, Robot[0].Attr, IO["name"].DI, etc.
		// Also match with array index: Base["name"].Value[1], Point["p1"].Joint[0], etc.
		const paramObjMatch = cleanExpr.match(/^(Point|Base|TCP|VPoint|IO|FT|Robot)\s*\[[^\]]+\]\s*\.(\w+)(\[\d+\])?/);
		if (paramObjMatch) {
			const objName = paramObjMatch[1];
			const attrName = paramObjMatch[2];
			const hasArrayIndex = paramObjMatch[3]; // e.g., [1]
			if (functionsData.parameterizedObjects && functionsData.parameterizedObjects[objName]) {
				const paramObj = functionsData.parameterizedObjects[objName] as any;
				if (paramObj.attributes && paramObj.attributes[attrName]) {
					let attrType = paramObj.attributes[attrName].type;
					// If there's an array index and the type is an array, return the base type
					if (hasArrayIndex && attrType.includes("[]")) {
						return attrType.replace("[]", "");
					}
					return attrType;
				}
			}
		}
		
		// Check for Env.Attr (with optional array index)
		const envMatch = cleanExpr.match(/^Env\.(\w+)(\[\d+\])?/);
		if (envMatch) {
			const attrName = envMatch[1];
			const hasArrayIndex = envMatch[2];
			if (functionsData.parameterizedObjects && functionsData.parameterizedObjects["Env"]) {
				const paramObj = functionsData.parameterizedObjects["Env"] as any;
				if (paramObj.attributes && paramObj.attributes[attrName]) {
					let attrType = paramObj.attributes[attrName].type;
					if (hasArrayIndex && attrType.includes("[]")) {
						return attrType.replace("[]", "");
					}
					return attrType;
				}
			}
		}
		
		// Check if it's a function call (with optional array index for extracting single element)
		// Match: FuncName(...) or FuncName(...)[0]
		const funcMatch = cleanExpr.match(/^(\w+)\s*\([^)]*\)(\[\d+\])?/);
		if (funcMatch) {
			const funcName = funcMatch[1];
			const hasArrayIndex = funcMatch[2];
			if (functionsData[funcName] && funcName !== "types" && funcName !== "parameterizedObjects") {
				const funcInfo = functionsData[funcName] as any;
				// Get the return type (could be string or array for per-signature types)
				if (funcInfo.returnType) {
					let returnType: string;
					if (Array.isArray(funcInfo.returnType)) {
						// Per-signature return types - return the first one as default
						returnType = funcInfo.returnType[0];
					} else {
						returnType = funcInfo.returnType;
					}
					// If there's an array index and the type is an array, return the base type
					if (hasArrayIndex && returnType.includes("[]")) {
						return returnType.replace("[]", "");
					}
					return returnType;
				}
			}
		}
		
		// Check if it's an array literal
		if (cleanExpr.startsWith("[")) {
			// Try to infer the element type
			const innerContent = cleanExpr.slice(1, -1).trim();
			if (innerContent) {
				const firstElement = innerContent.split(",")[0].trim();
				const elementType = inferExpressionType(firstElement);
				if (elementType && !elementType.includes("[]")) {
					return elementType + "[]";
				}
			}
			return "array";
		}
		
		// Check if it's a known variable (would need variableTypes map passed in)
		// For now, return null for unknown
		return null;
	};

	const updateDiagnostics = (document: vscode.TextDocument) => {
		const diagnostics: vscode.Diagnostic[] = [];

		// Track multi-line comment state
		let inBlockComment = false;

		// Helper function to remove comments from a line
		const removeComments = (line: string): string => {
			let result = line;
			
			// Handle block comment state
			if (inBlockComment) {
				const endIndex = result.indexOf("*/");
				if (endIndex !== -1) {
					inBlockComment = false;
					result = " ".repeat(endIndex + 2) + result.substring(endIndex + 2);
				} else {
					return " ".repeat(result.length); // Entire line is in block comment
				}
			}
			
			// Remove block comments that start and end on this line
			result = result.replace(/\/\*.*?\*\//g, match => " ".repeat(match.length));
			
			// Check for block comment start without end
			const blockStartIndex = result.indexOf("/*");
			if (blockStartIndex !== -1) {
				inBlockComment = true;
				result = result.substring(0, blockStartIndex) + " ".repeat(result.length - blockStartIndex);
			}
			
			// Remove single-line comments
			const lineCommentIndex = result.indexOf("//");
			if (lineCommentIndex !== -1) {
				result = result.substring(0, lineCommentIndex) + " ".repeat(result.length - lineCommentIndex);
			}
			
			return result;
		};

		// Collect all defined variables and their types
		const definedVariables: Set<string> = new Set();
		const variableTypes: Map<string, string> = new Map();
		
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;
			const lineWithoutComments = removeComments(line);
			
			// Match variable declarations: type variableName = value
			const varDeclMatch = lineWithoutComments.match(/\b((?:string|int|byte|float|double|bool|[A-Z]\w+)(?:\[\])?)\s+(\w+)\s*=\s*(.+)/);
			if (varDeclMatch) {
				const varType = varDeclMatch[1];
				const varName = varDeclMatch[2];
				const varValue = varDeclMatch[3].trim();
				
				definedVariables.add(varName);
				variableTypes.set(varName, varType);
				
				// Check for type mismatch using the helper function
				const inferredType = inferExpressionType(varValue);
				
				if (inferredType !== null) {
					// We have a known type for the expression
					const isArrayType = varType.includes("[]");
					const isInferredArray = inferredType === "array" || inferredType.includes("[]");
					
					// Check if types are compatible
					let typeMismatch = false;
					let mismatchMessage = "";
					
					if (isArrayType && !isInferredArray) {
						typeMismatch = true;
						mismatchMessage = `Type mismatch: "${varType}" expected but "${inferredType}" provided`;
					} else if (!isArrayType && isInferredArray) {
						typeMismatch = true;
						mismatchMessage = `Type mismatch: "${varType}" expected but array provided`;
					} else if (inferredType !== "array") {
						// Both are same array/non-array status, check base types
						const baseVarType = varType.replace("[]", "");
						const baseInferredType = inferredType.replace("[]", "");
						
						// Only flag error if base types are clearly incompatible
						if (baseVarType !== baseInferredType && baseInferredType !== "void") {
							typeMismatch = true;
							mismatchMessage = `Type mismatch: "${varType}" expected but "${inferredType}" provided`;
						}
					}
					
					if (typeMismatch) {
						const typeStart = line.indexOf(varType);
						const range = new vscode.Range(
							new vscode.Position(i, typeStart),
							new vscode.Position(i, typeStart + varType.length)
						);
						diagnostics.push(
							new vscode.Diagnostic(
								range,
								mismatchMessage,
								vscode.DiagnosticSeverity.Error
							)
						);
					}
				} else {
					// Fallback: simple array check for unknown expressions
					const isArrayType = varType.includes("[]");
					const isArrayValue = varValue.startsWith("[");
					
					if (!isArrayType && isArrayValue) {
						const typeStart = line.indexOf(varType);
						const range = new vscode.Range(
							new vscode.Position(i, typeStart),
							new vscode.Position(i, typeStart + varType.length)
						);
						diagnostics.push(
							new vscode.Diagnostic(
								range,
								`Type mismatch: "${varType}" expected but array provided`,
								vscode.DiagnosticSeverity.Error
							)
						);
					}
				}
			} else {
				// Also capture declarations without assignment for variable tracking
				const varDeclNoAssignMatch = lineWithoutComments.match(/\b(?:string|int|byte|float|double|bool|[A-Z]\w+)(?:\[\])?\s+(\w+)\s*;/);
				if (varDeclNoAssignMatch) {
					definedVariables.add(varDeclNoAssignMatch[1]);
				}
			}
		}

		// Keywords to skip
		const keywords = new Set(["if", "while", "for", "return", "switch", "do", "break", "continue", "case", "else", "default", "void", "define", "closestop", "errorstop", "true", "false", "main", "newline"]);

		// Parse user-defined functions
		const userDefinedFunctions = parseUserDefinedFunctions(document);

		// Build function scopes: map each line to the parameters that are valid on that line
		// This requires tracking braces to determine where each function body starts and ends
		const lineFunctionParams: Map<number, Set<string>> = new Map();
		
		// First pass: find function definitions and track their scopes
		let currentFunctionParams: Set<string> | null = null;
		let braceDepth = 0;
		let functionStartBraceDepth = 0;
		inBlockComment = false;
		
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;
			const lineWithoutComments = removeComments(line);
			
			// Check if this line is a function definition
			const funcDefMatch = lineWithoutComments.match(/^\s*(void|string|int|byte|float|double|bool|[A-Z]\w*)(\[\])?\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/);
			if (funcDefMatch && currentFunctionParams === null) {
				const paramsString = funcDefMatch[4].trim();
				currentFunctionParams = new Set<string>();
				
				if (paramsString) {
					const paramParts = paramsString.split(",");
					for (const param of paramParts) {
						const trimmed = param.trim();
						// Extract just the parameter name
						const paramMatch = trimmed.match(/^(?:string|int|byte|float|double|bool|[A-Z]\w*)(?:\[\])?\s+(\w+)$/);
						if (paramMatch) {
							currentFunctionParams.add(paramMatch[1]);
						}
					}
				}
				functionStartBraceDepth = braceDepth;
			}
			
			// Track braces (remove strings first to avoid counting braces inside strings)
			const lineWithoutStrings = lineWithoutComments.replace(/"[^"]*"/g, match => " ".repeat(match.length));
			for (const char of lineWithoutStrings) {
				if (char === "{") {
					braceDepth++;
				} else if (char === "}") {
					braceDepth--;
					// Check if we're closing the current function's scope
					if (currentFunctionParams !== null && braceDepth === functionStartBraceDepth) {
						currentFunctionParams = null;
					}
				}
			}
			
			// If we're inside a function, record its parameters for this line
			if (currentFunctionParams !== null) {
				lineFunctionParams.set(i, currentFunctionParams);
			}
		}

		// Reset block comment state for second pass
		inBlockComment = false;

		// Check for undefined variables and non-existent functions
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;
			const lineWithoutComments = removeComments(line);

			// Remove strings from the line for checking (replace content in quotes with spaces)
			let lineWithoutStrings = lineWithoutComments.replace(/"[^"]*"/g, match => " ".repeat(match.length));

			// Check for function calls
			const functionMatches = [...lineWithoutStrings.matchAll(/\b([A-Za-z_]\w+)\s*\(/g)];
			for (const match of functionMatches) {
				const functionName = match[1];
				
				// Skip if it"s a keyword
				if (keywords.has(functionName)) {
					continue;
				}

				// Check if it's a method call (preceded by a dot)
				const precedingText = lineWithoutStrings.substring(0, match.index);
				if (/\.\s*$/.test(precedingText)) {
					// It's a method call - validate against the variable's type
					const methodCallMatch = precedingText.match(/\b(\w+)\s*\.$/);
					if (methodCallMatch) {
						const varName = methodCallMatch[1];
						const varType = variableTypes.get(varName);
						
						if (varType && functionsData.types && functionsData.types[varType]) {
							const typeInfo = functionsData.types[varType] as any;
							if (typeInfo.methods && !typeInfo.methods[functionName]) {
								const startChar = match.index!;
								const endChar = startChar + functionName.length;
								const range = new vscode.Range(
									new vscode.Position(i, startChar),
									new vscode.Position(i, endChar)
								);
								diagnostics.push(
									new vscode.Diagnostic(
										range,
										`Method "${functionName}" does not exist on type "${varType}"`,
										vscode.DiagnosticSeverity.Error
									)
								);
							}
						}
					}
					continue;
				}
				
				// Check if function exists in functionsData or user-defined functions
				const isBuiltInFunction = functionsData[functionName] && functionName !== "types" && functionName !== "parameterizedObjects";
				const isUserDefinedFunction = userDefinedFunctions.has(functionName);
				
				if (!isBuiltInFunction && !isUserDefinedFunction) {
					const startChar = match.index!;
					const endChar = startChar + functionName.length;
					const range = new vscode.Range(
						new vscode.Position(i, startChar),
						new vscode.Position(i, endChar)
					);
					diagnostics.push(
						new vscode.Diagnostic(
							range,
							`Function "${functionName}" does not exist`,
							vscode.DiagnosticSeverity.Error
						)
					);
				}
			}

			// Check for variable usage (excluding declarations and strings)
			const varUseMatches = [...lineWithoutStrings.matchAll(/\b([A-Za-z_]\w+)\b/g)];
			for (const match of varUseMatches) {
				const varName = match[1];
				const context = lineWithoutStrings.substring(0, match.index);
				
				// Skip if it's an attribute access (preceded by .)
				if (/\.\s*$/.test(context)) {
					continue;
				}
				
				// Skip if it"s a declaration (preceded by type keyword or custom type)
				const isDeclaration = /(?:string|int|byte|float|double|bool|[A-Z]\w+)\s+$/.test(context);
				
				// Skip if it"s a keyword
				if (keywords.has(varName)) {
					continue;
				}

				// Skip if it"s a type name
				if (["string", "int", "byte", "float", "double", "bool"].includes(varName) || 
					(functionsData.types && functionsData.types[varName])) {
					continue;
				}

				// Skip if it"s a parameterized object name
				if (functionsData.parameterizedObjects && functionsData.parameterizedObjects[varName]) {
					continue;
				}

				// Skip if followed by ( - it"s a function call that was already checked
				if (lineWithoutStrings[match.index! + varName.length] === "(") {
					continue;
				}

				// Skip if it"s an external variable (var_ or g_ prefix)
				if (varName.startsWith("var_") || varName.startsWith("g_")) {
					continue;
				}

				// Check if variable is a function parameter in the current scope
				const scopeParams = lineFunctionParams.get(i);
				if (scopeParams && scopeParams.has(varName)) {
					continue;
				}

				if (!isDeclaration && !definedVariables.has(varName)) {
					const startChar = match.index!;
					const endChar = startChar + varName.length;
					const range = new vscode.Range(
						new vscode.Position(i, startChar),
						new vscode.Position(i, endChar)
					);
					diagnostics.push(
						new vscode.Diagnostic(
							range,
							`Variable "${varName}" is not defined`,
							vscode.DiagnosticSeverity.Error
						)
					);
				}
			}
		}

		// Check for bracket mismatches
		const bracketStack: Array<{type: string, line: number, char: number}> = [];
		
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;
			
			// Remove strings from the line for bracket checking
			let lineWithoutStrings = line.replace(/"[^"]*"/g, match => " ".repeat(match.length));
			
			for (let j = 0; j < lineWithoutStrings.length; j++) {
				const char = lineWithoutStrings[j];
				
				if (char === "(" || char === "{") {
					bracketStack.push({type: char, line: i, char: j});
				} else if (char === ")" || char === "}") {
					const expectedClose = char === ")" ? "(" : "{";
					
					if (bracketStack.length === 0 || bracketStack[bracketStack.length - 1].type !== expectedClose) {
						// Closing bracket without matching opening bracket
						const range = new vscode.Range(
							new vscode.Position(i, j),
							new vscode.Position(i, j + 1)
						);
						diagnostics.push(
							new vscode.Diagnostic(
								range,
								`Unmatched closing bracket "${char}"`,
								vscode.DiagnosticSeverity.Error
							)
						);
					} else {
						// Pop matching bracket
						bracketStack.pop();
					}
				}
			}
		}
		
		// Check for unclosed brackets
		for (const unclosed of bracketStack) {
			const line = document.lineAt(unclosed.line).text;
			const range = new vscode.Range(
				new vscode.Position(unclosed.line, unclosed.char),
				new vscode.Position(unclosed.line, unclosed.char + 1)
			);
			diagnostics.push(
				new vscode.Diagnostic(
					range,
					`Unclosed bracket "${unclosed.type}" - missing "${unclosed.type === "(" ? ")" : "}"}"`,
					vscode.DiagnosticSeverity.Error
				)
			);
		}

		diagnosticCollection.set(document.uri, diagnostics);
	};

	// Update diagnostics when document is opened or changed (only for tmscript files)
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (doc.languageId === "tmscript") {
				updateDiagnostics(doc);
			}
		}),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === "tmscript") {
				updateDiagnostics(event.document);
			}
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			// Clear diagnostics when document is closed
			diagnosticCollection.delete(doc.uri);
		})
	);

	// Update diagnostics for currently open tmscript documents
	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === "tmscript") {
			updateDiagnostics(doc);
		}
	});
}

export function deactivate() {}
