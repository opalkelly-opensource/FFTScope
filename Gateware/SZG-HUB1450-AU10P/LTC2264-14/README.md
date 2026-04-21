Build the gateware by setting `VIVADO_HOME` once, then running the
build script in this folder.

## Setup (once per machine)

Set `VIVADO_HOME` to your Vivado install directory — the one
containing `settings64.{sh,bat}`. AMD installer defaults:

- **2025.1+:** `C:\AMDDesignTools\<ver>\Vivado` / `/opt/AMDDesignTools/<ver>/Vivado`
- **2024.x and earlier:** `C:\Xilinx\Vivado\<ver>` / `/opt/Xilinx/Vivado/<ver>`

Run the command for your OS, then open a fresh terminal:

**Windows** (Command Prompt):

    setx VIVADO_HOME "C:\AMDDesignTools\2025.2\Vivado"

**Ubuntu:**

    echo 'export VIVADO_HOME=/opt/AMDDesignTools/2025.2/Vivado' >> ~/.bashrc

## Requirements

- Vivado 2023.2 or later (Vitis Unified is bundled with Vivado; no
  separate Vitis install is needed)
- FrontPanel SDK with the BWMode3 HDL sources for SZG-HUB1450 (see
  `FrontPanel/README.txt` in this folder for where to copy them from)

## Build

1. Locate the BWMode3 HDL source folder for the SZG-HUB1450 in the
   FrontPanel SDK and copy it into `./FrontPanel/` so that
   `./FrontPanel/BWMode3/okHost.vp` and `./FrontPanel/BWMode3/okHost.xdc`
   exist. See `FrontPanel/README.txt` for details.

2. From this folder, run the build script:

      Linux:    ./project.sh
      Windows:  project.bat

3. When Vivado opens, Generate the bitstream.


Copyright (c) 2026 Opal Kelly Incorporated
