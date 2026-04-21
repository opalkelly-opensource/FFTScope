# USAGE: ./project.sh
# See README.md in this folder, or the "How To Build the Gateware"
# section of the FFTScope example documentation.
# Requires Vivado 2023.2 or later.
# Prerequisite: VIVADO_HOME must point at the directory containing
# settings64.sh (the Vivado dir). See README.md.
# Prerequisite: ./FrontPanel/BWMode3/ must contain okHost.vp and okHost.xdc
# from the FrontPanel SDK before running. See FrontPanel/README.txt.
# Copyright (c) 2026 Opal Kelly Incorporated

# --- Locate Vivado tools via VIVADO_HOME -------------------------------
if [ -z "$VIVADO_HOME" ]; then
    echo "error: VIVADO_HOME is not set." >&2
    echo "  Set it to the directory containing settings64.sh, e.g.:" >&2
    echo "    2025.1+:            /opt/AMDDesignTools/2025.2/Vivado" >&2
    echo "    2024.x and earlier: /opt/Xilinx/Vivado/2024.2" >&2
    echo "  See README.md for details." >&2
    exit 3
fi
if [ ! -f "$VIVADO_HOME/settings64.sh" ]; then
    echo "error: settings64.sh not found in VIVADO_HOME ($VIVADO_HOME)" >&2
    exit 3
fi
source "$VIVADO_HOME/settings64.sh"

cd hls/ifft
if [ -f vitis/solution1/impl/export.zip ]; then
    echo "IFFT HLS core already built, skipping..."
else
    vitis-run --mode hls --tcl run_hls.tcl
fi
cd ../fft
if [ -f vitis/solution1/impl/export.zip ]; then
    echo "FFT HLS core already built, skipping..."
else
    vitis-run --mode hls --tcl run_hls.tcl
fi
cd ../..
vivado -source project.tcl
