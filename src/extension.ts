import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	// Load functions data
	const functionsPath = path.join(context.extensionPath, 'data', 'functions.json');
	const functionsData = JSON.parse(fs.readFileSync(functionsPath, 'utf8'));

	// Register completion provider
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		'tmscript', // language id
		{
			provideCompletionItems(document, position, token) {
				const completionItems: vscode.CompletionItem[] = [];

				// Create completion items for each function (skip 'types')
				for (const [functionName, functionInfo] of Object.entries(functionsData)) {
					if (functionName === 'types') continue; // Skip types section

					const item = new vscode.CompletionItem(
						functionName,
						vscode.CompletionItemKind.Function
					);

					// Build documentation with all signatures
					const signatures = (functionInfo as any).signatures.map((sig: string[]) => {
						const params = sig.join(', ');
						return `${functionName}(${params}) → ${(functionInfo as any).return}`;
					}).join('\n');

					const documentation = new vscode.MarkdownString(
						`${(functionInfo as any).documentation}\n\n**Signatures:**\n\`\`\`\n${signatures}\n\`\`\``
					);

					item.documentation = documentation;
					item.detail = `Returns: ${(functionInfo as any).return}`;

					// Add signature help with all overloads - include parentheses and position cursor inside
					item.insertText = new vscode.SnippetString(`${functionName}($0)`);
					item.command = { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' };

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
				const keywords = ['if', 'else', 'while', 'for', 'do', 'switch', 'case', 'break', 'continue', 'return', 'default'];
				for (const keyword of keywords) {
					const item = new vscode.CompletionItem(
						keyword,
						vscode.CompletionItemKind.Keyword
					);
					item.detail = `Keyword`;
					item.insertText = keyword;
					completionItems.push(item);
				}

				// Add data types to completion
				const dataTypes = ['string', 'int', 'byte', 'float', 'double', 'bool', 'string[]', 'int[]', 'byte[]', 'float[]', 'double[]', 'bool[]'];
				for (const dataType of dataTypes) {
					const item = new vscode.CompletionItem(
						dataType,
						vscode.CompletionItemKind.TypeParameter
					);
					item.detail = `Data Type`;
					item.insertText = dataType;
					completionItems.push(item);
				}

				return completionItems;
			}
		},
		// Trigger completion on function name start (optional: add more trigger characters)
	);

	context.subscriptions.push(completionProvider);

	// Register attribute completion provider for custom types (e.g., base.Value)
	const attributeCompletionProvider = vscode.languages.registerCompletionItemProvider(
		'tmscript',
		{
			provideCompletionItems(document, position, token) {
				const line = document.lineAt(position).text;
				const textBeforePosition = line.substring(0, position.character);

				// Check if we're after a dot
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
						const params = (methodInfo as any).parameters.join(', ');
						item.detail = `Returns: ${(methodInfo as any).return}`;
						item.documentation = new vscode.MarkdownString((methodInfo as any).documentation);
						item.insertText = `${methodName}()`;
						item.command = { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' };
						completionItems.push(item);
					}
				}

				return completionItems;
			}
		},
		'.'
	);

	context.subscriptions.push(attributeCompletionProvider);

	// Register signature help provider for parameter hints
	const signatureProvider = vscode.languages.registerSignatureHelpProvider(
		'tmscript',
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

				if (!functionInfo) {
					return null;
				}

				// Build signature information
				const signatures = (functionInfo.signatures as string[][]).map(sig => {
					const params = sig.map(p => new vscode.ParameterInformation(p)).join(', ');
					const signatureLabel = `${functionName}(${sig.join(', ')}) → ${functionInfo.return}`;
					
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
		},
		'(',
		','
	);

	context.subscriptions.push(signatureProvider);

	// Register method signature help provider for custom types
	const methodSignatureProvider = vscode.languages.registerSignatureHelpProvider(
		'tmscript',
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
					`${methodName}(${(methodInfo as any).parameters.join(', ')}) → ${(methodInfo as any).return}`,
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
		'(',
		','
	);

	context.subscriptions.push(methodSignatureProvider);

	// Register hover provider for variable type information
	const hoverProvider = vscode.languages.registerHoverProvider(
		'tmscript',
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
						const isArray = varLine.includes('[]');
						const fullType = isArray ? `${type}[]` : type;
						variableMap.set(varName, { type: fullType, value });
						continue;
					}

					// Match custom types (TBase, TRobot, etc.) - start with uppercase
					const customMatch = varLine.match(/\b([A-Z]\w+)\s+(\w+)\s*(?:=\s*(.+?))?(?:;|$)/);
					if (customMatch && functionsData.types && functionsData.types[customMatch[1]]) {
						const type = customMatch[1];
						const varName = customMatch[2];
						const value = customMatch[3]?.trim() || '';
						variableMap.set(varName, { type, value });
					}
				}

				// Check if this is an attribute access (e.g., base.Value)
				if (charBefore === '.') {
					const beforeDot = line.substring(0, wordRange.start.character - 1).trim();
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
								const params = (methodInfo as any).parameters.join(', ');
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

				// Check if word is a function (skip 'types' key)
				if (functionsData[word] && word !== 'types' && (functionsData[word] as any).signatures) {
					const functionInfo = functionsData[word];
					const signatures = (functionInfo.signatures as string[][]).map(sig => {
						const params = sig.join(', ');
						return `${word}(${params}) → ${functionInfo.return}`;
					}).join('\n');

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
						markdownContent += `\n\n**Constructor:**\n\`\`\`\n${(typeInfo as any).constructor}\n\`\`\``;
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

				return null;
			}
		}
	);

	context.subscriptions.push(hoverProvider);

	// Register diagnostic provider for undefined variables and non-existent functions
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('tmscript');
	context.subscriptions.push(diagnosticCollection);

	const updateDiagnostics = (document: vscode.TextDocument) => {
		const diagnostics: vscode.Diagnostic[] = [];

		// Collect all defined variables and their types
		const definedVariables: Set<string> = new Set();
		const variableTypes: Map<string, string> = new Map();
		
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;
			
			// Match variable declarations: type variableName = value
			const varDeclMatch = line.match(/\b((?:string|int|byte|float|double|bool|[A-Z]\w+)(?:\[\])?)\s+(\w+)\s*=\s*(.+)/);
			if (varDeclMatch) {
				const varType = varDeclMatch[1];
				const varName = varDeclMatch[2];
				const varValue = varDeclMatch[3].trim();
				
				definedVariables.add(varName);
				variableTypes.set(varName, varType);
				
				// Check for type mismatch
				const isArrayType = varType.includes('[]');
				const isArrayValue = varValue.startsWith('[');
				
				if (isArrayType && !isArrayValue) {
					// Array type assigned non-array value
					const typeStart = line.indexOf(varType);
					const range = new vscode.Range(
						new vscode.Position(i, typeStart),
						new vscode.Position(i, typeStart + varType.length)
					);
					diagnostics.push(
						new vscode.Diagnostic(
							range,
							`Type mismatch: '${varType}' expected but '${varValue.match(/\w+/) ? (varValue.match(/\w+/)?.[0]) : 'non-array'}' provided`,
							vscode.DiagnosticSeverity.Error
						)
					);
				} else if (!isArrayType && isArrayValue) {
					// Non-array type assigned array value
					const typeStart = line.indexOf(varType);
					const range = new vscode.Range(
						new vscode.Position(i, typeStart),
						new vscode.Position(i, typeStart + varType.length)
					);
					diagnostics.push(
						new vscode.Diagnostic(
							range,
							`Type mismatch: '${varType}' expected but array provided`,
							vscode.DiagnosticSeverity.Error
						)
					);
				}
			} else {
				// Also capture declarations without assignment for variable tracking
				const varDeclNoAssignMatch = line.match(/\b(?:string|int|byte|float|double|bool|[A-Z]\w+)(?:\[\])?\s+(\w+)\s*;/);
				if (varDeclNoAssignMatch) {
					definedVariables.add(varDeclNoAssignMatch[1]);
				}
			}
		}

		// Keywords to skip
		const keywords = new Set(['if', 'while', 'for', 'return', 'switch', 'do', 'break', 'continue', 'case', 'else', 'default', 'void']);

		// Check for undefined variables and non-existent functions
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text;

			// Remove strings from the line for checking (replace content in quotes with spaces)
			let lineWithoutStrings = line.replace(/"[^"]*"/g, match => ' '.repeat(match.length));

			// Check for function calls
			const functionMatches = [...lineWithoutStrings.matchAll(/\b([A-Za-z_]\w+)\s*\(/g)];
			for (const match of functionMatches) {
				const functionName = match[1];
				
				// Skip if it's a keyword
				if (keywords.has(functionName)) {
					continue;
				}
				
				// Check if function exists in functionsData
				if (!functionsData[functionName] || functionName === 'types') {
					const startChar = match.index!;
					const endChar = startChar + functionName.length;
					const range = new vscode.Range(
						new vscode.Position(i, startChar),
						new vscode.Position(i, endChar)
					);
					diagnostics.push(
						new vscode.Diagnostic(
							range,
							`Function '${functionName}' does not exist`,
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
				
				// Skip if it's a declaration (preceded by type keyword or custom type)
				const isDeclaration = /(?:string|int|byte|float|double|bool|[A-Z]\w+)\s+$/.test(context);
				
				// Skip if it's a keyword
				if (keywords.has(varName)) {
					continue;
				}

				// Skip if it's a type name
				if (['string', 'int', 'byte', 'float', 'double', 'bool'].includes(varName) || 
					(functionsData.types && functionsData.types[varName])) {
					continue;
				}

				// Skip if followed by ( - it's a function call that was already checked
				if (lineWithoutStrings[match.index! + varName.length] === '(') {
					continue;
				}

				// Skip if it's an external variable (var_ or g_ prefix)
				if (varName.startsWith('var_') || varName.startsWith('g_')) {
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
							`Variable '${varName}' is not defined`,
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
			let lineWithoutStrings = line.replace(/"[^"]*"/g, match => ' '.repeat(match.length));
			
			for (let j = 0; j < lineWithoutStrings.length; j++) {
				const char = lineWithoutStrings[j];
				
				if (char === '(' || char === '{') {
					bracketStack.push({type: char, line: i, char: j});
				} else if (char === ')' || char === '}') {
					const expectedClose = char === ')' ? '(' : '{';
					
					if (bracketStack.length === 0 || bracketStack[bracketStack.length - 1].type !== expectedClose) {
						// Closing bracket without matching opening bracket
						const range = new vscode.Range(
							new vscode.Position(i, j),
							new vscode.Position(i, j + 1)
						);
						diagnostics.push(
							new vscode.Diagnostic(
								range,
								`Unmatched closing bracket '${char}'`,
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
					`Unclosed bracket '${unclosed.type}' - missing '${unclosed.type === '(' ? ')' : '}'}'`,
					vscode.DiagnosticSeverity.Error
				)
			);
		}

		diagnosticCollection.set(document.uri, diagnostics);
	};

	// Update diagnostics when document is opened or changed
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
		vscode.workspace.onDidChangeTextDocument(event => updateDiagnostics(event.document))
	);

	// Update diagnostics for currently open documents
	vscode.workspace.textDocuments.forEach(updateDiagnostics);
}

export function deactivate() {}
