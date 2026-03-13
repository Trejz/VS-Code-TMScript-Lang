# Changelog

All notable changes to the TMscript Language Support extension will be documented in this file.

## [0.6.1] - 2026-03-13

### Added

#### User-Defined Function Support
- **Function Recognition** — Define your own functions with `returnType functionName(params)` syntax and they are now fully recognized
- **Autocompletion** — User-defined functions appear in autocomplete suggestions with their signature and return type
- **Signature Help** — Parameter hints are shown when calling your custom functions
- **Hover Documentation** — Hover over function names to see their signature and definition line number
- **No False Errors** — User-defined functions are no longer flagged as "does not exist"

#### Function Parameter Scope
- **Parameter Autocompletion** — Parameters are suggested in autocomplete when typing inside their function

#### Syntax Highlighting
- Added Syntax Highlighting for Script Project Keywords

---

## [0.5.0] - 2026-03-09

### Initial Release

First official release of the TMscript Language Support extension for VS Code.

### Features

#### Syntax Highlighting
- Keywords and control flow statements (`if`, `else`, `while`, `for`, `switch`, `case`, etc.)
- Data types (`int`, `float`, `double`, `string`, `byte`, `bool` and arrays)
- Function calls and string literals
- Single-line (`//`) and multi-line (`/* */`) comments

#### IntelliSense
- Autocomplete suggestions for all built-in functions
- Autocomplete for custom types and their constructors
- Autocomplete for parameterized objects (`Point`, `Base`, `TCP`, `VPoint`, `IO`, `Robot`, `FT`, `Env`)
- Autocomplete for type methods and attributes after `.`
- Autocomplete for user-defined variables
- Keyword and data type suggestions

#### Hover Documentation
- Detailed documentation on hover for all functions
- Type information for variables
- Method and attribute documentation for custom types
- Parameterized object attribute information

#### Signature Help
- Parameter hints when typing function arguments
- Support for multiple function overloads
- Method signature help for custom types

#### Diagnostics
- Detection of undefined variables
- Detection of non-existent function calls
- Type mismatch warnings
- Bracket mismatch detection (parentheses and curly braces)
- Comment-aware diagnostics (ignores commented code)

### Supported TMscript Functions

Based on TMscript 2.24 documentation:

- **Data Conversion**: `Byte_ToInt16`, `Byte_ToFloat`, `String_ToInteger`, `GetBytes`, `GetString`, etc.
- **String Operations**: `String_Split`, `String_Replace`, `String_Trim`, `String_IndexOf`, etc.
- **Array Operations**: `Array_Append`, `Array_Insert`, `Array_Remove`, `Array_Sort`, etc.
- **Math Functions**: `abs`, `pow`, `sqrt`, `sin`, `cos`, `tan`, `log`, `random`, etc.
- **Coordinate Functions**: `dist`, `trans`, `applytrans`, `changeref`, `inversekin`, `forwardkin`, etc.
- **File I/O**: `File_ReadText`, `File_WriteText`, `File_Exists`, `File_Delete`, etc.
- **Serial Communication**: `com_open`, `com_read`, `com_write`, `com_close`
- **Socket Communication**: `socket_open`, `socket_read`, `socket_send`, `socket_close`
- **Motion Control**: `PTP`, `Move_PTP`, `Line`, `Move_Line`, `Circle`, `PLine`, etc.
- **Vision**: `Vision_DoJob`, `Vision_GetOutputArrayValue`, `Vision_IsJobAvailable`, etc.
- **Modbus**: `modbus_open`, `modbus_read`, `modbus_write`, etc.
- **PROFINET**: `profinet_read_input`, `profinet_write_output`, etc.
- **EtherNet/IP**: `eip_read_input`, `eip_write_output`, etc.
- **EtherCAT**: `ethercat_read_input`, `ethercat_write_output`, etc.
- **CC-Link**: `cclink_read_input`, `cclink_write_output`, etc.
- **System**: `Display`, `Sleep`, `WaitFor`, `Exit`, `Pause`, `Resume`, etc.

### Supported Custom Types

- `SerialPort` - Serial port communication
- `Socket` - TCP/IP socket communication
- `TPoint` - Point data with coordinates and joint angles
- `TTCP` - Tool Center Point configuration
- `ModbusTCP` / `ModbusRTU` - Modbus communication
- `Compliance` - Compliance control motion
- `TouchStop` - Touch stop control (Compliance, Line, Force modes)
- `FTSensor` - Force/Torque sensor device
- `Force` - Force control motion settings

### Parameterized Objects

- `Point["name"]` - Access project point data
- `Base["name"]` - Access base coordinate data
- `TCP["name"]` - Access TCP configuration
- `VPoint["name"]` - Access vision point data
- `IO["name"]` - Access I/O module data
- `Robot[index]` - Access robot state information
- `FT["name"]` - Access force/torque sensor data
- `Env` - Access environment and system information

---

**Note:** This extension is designed primarily for the Script Node in TMflow projects. Some features for full standalone script projects may be limited.
