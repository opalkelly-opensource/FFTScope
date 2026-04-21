@echo off

REM USAGE: project.bat
REM See README.md in this folder, or the "How To Build the Gateware"
REM section of the FFTScope example documentation.
REM Requires Vivado 2023.2 or later.
REM Prerequisites (env vars; see README.md):
REM   VIVADO_HOME         - directory containing settings64.bat
REM   FRONTPANEL_IP_REPO  - directory you extracted the FrontPanel
REM                         Vivado IP Core distribution to
REM Copyright (c) 2026 Opal Kelly Incorporated

REM --- Locate Vivado tools via VIVADO_HOME -------------------------------
IF NOT DEFINED VIVADO_HOME (
    @echo on
    echo error: VIVADO_HOME is not set.
    echo   Set it to the directory containing settings64.bat, e.g.:
    echo     2025.1+:            C:\AMDDesignTools\2025.2\Vivado
    echo     2024.x and earlier: C:\Xilinx\Vivado\2024.2
    echo   See README.md for details.
    EXIT /B 3
)
IF NOT EXIST "%VIVADO_HOME%\settings64.bat" (
    @echo on
    echo error: settings64.bat not found in VIVADO_HOME ^(%VIVADO_HOME%^)
    EXIT /B 3
)
call "%VIVADO_HOME%\settings64.bat"

REM --- Locate FrontPanel IP via FRONTPANEL_IP_REPO -----------------------
IF NOT DEFINED FRONTPANEL_IP_REPO (
    @echo on
    echo error: FRONTPANEL_IP_REPO is not set.
    echo   Set it to the directory you extracted the FrontPanel Vivado
    echo   IP Core distribution to. See README.md for the download link.
    EXIT /B 3
)
IF NOT EXIST "%FRONTPANEL_IP_REPO%" (
    @echo on
    echo error: FRONTPANEL_IP_REPO directory not found ^(%FRONTPANEL_IP_REPO%^)
    EXIT /B 3
)

REM Vivado prefers forward-slash paths in tclargs; convert backslashes.
set FrontPanelIPRepo=%FRONTPANEL_IP_REPO%
set vivado_separator=/
call set FrontPanelIPRepo=%%FrontPanelIPRepo:\=%vivado_separator%%%
echo %FrontPanelIPRepo%

REM This starts a new cmd window, passing the current env (/i) and waiting for it to stop.
REM /c Carries out the command specified (vitis-run) by string and then stops.
cd hls/ifft
if exist vitis\solution1\impl\export.zip (
    echo IFFT HLS core already built, skipping...
) else (
    echo Launching vitis-run in another cmd prompt to build the IFFT core...
    start /wait cmd /c vitis-run --mode hls --tcl run_hls.tcl
    if not exist vitis\solution1\impl\export.zip GOTO BUILD_FAIL
)
cd ../fft
if exist vitis\solution1\impl\export.zip (
    echo FFT HLS core already built, skipping...
) else (
    echo Launching vitis-run in another cmd prompt to build the FFT core...
    start /wait cmd /c vitis-run --mode hls --tcl run_hls.tcl
    if not exist vitis\solution1\impl\export.zip GOTO BUILD_FAIL
)

cd ../..

vivado -source project.tcl -tclargs %FrontPanelIPRepo%
EXIT /B 0

 :BUILD_FAIL
@echo on
echo IFFT/FFT Core build failed. Inspect the vitis-run.log files for errors.
echo Likely, your path is too long. You may need to move this project to a shorter base path.
EXIT /B 2
