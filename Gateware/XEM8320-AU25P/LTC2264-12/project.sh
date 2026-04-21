# USAGE: ./project.sh
# See README.md in this folder, or the "How To Build the Gateware"
# section of the FFTScope example documentation.
# Requires Vivado 2023.2 or later.
# Prerequisites (env vars; see README.md):
#   VIVADO_HOME         - directory containing settings64.sh
#   FRONTPANEL_IP_REPO  - directory you extracted the FrontPanel
#                         Vivado IP Core distribution to
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

# --- Locate FrontPanel IP via FRONTPANEL_IP_REPO -----------------------
if [ -z "$FRONTPANEL_IP_REPO" ]; then
    echo "error: FRONTPANEL_IP_REPO is not set." >&2
    echo "  Set it to the directory you extracted the FrontPanel Vivado" >&2
    echo "  IP Core distribution to. See README.md for the download link." >&2
    exit 3
fi
if [ ! -d "$FRONTPANEL_IP_REPO" ]; then
    echo "error: FRONTPANEL_IP_REPO directory not found ($FRONTPANEL_IP_REPO)" >&2
    exit 3
fi

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
vivado -source project.tcl -tclargs "$FRONTPANEL_IP_REPO"
