Build the gateware by setting two environment variables once, then
running the build script in this folder.

## Setup (once per machine)

Install the [XEM8320-AU25P board file](https://docs.opalkelly.com/fphdl/vivado-board-files/) — follow the instructions at the link.

Then set two environment variables:

- **`VIVADO_HOME`** — your Vivado install directory, the one
  containing `settings64.{sh,bat}`. AMD installer defaults:
  - **2025.1+:** `C:\AMDDesignTools\<ver>\Vivado` / `/opt/AMDDesignTools/<ver>/Vivado`
  - **2024.x and earlier:** `C:\Xilinx\Vivado\<ver>` / `/opt/Xilinx/Vivado/<ver>`
- **`FRONTPANEL_IP_REPO`** — the directory you extracted the
  FrontPanel Subsystem Vivado IP Core distribution to (download link
  under [Requirements](#requirements) below). Vivado adds this to its
  IP catalog search path.

Run the commands for your OS, then open a fresh terminal:

**Windows** (Command Prompt):

    setx VIVADO_HOME "C:\AMDDesignTools\2025.2\Vivado"
    setx FRONTPANEL_IP_REPO "C:\path\to\frontpanel-ip-core"

**Ubuntu:**

    echo 'export VIVADO_HOME=/opt/AMDDesignTools/2025.2/Vivado' >> ~/.bashrc
    echo 'export FRONTPANEL_IP_REPO=/path/to/frontpanel-ip-core' >> ~/.bashrc

## Requirements

- Vivado 2023.2 or later (Vitis Unified is bundled with Vivado; no
  separate Vitis install is needed)
- [FrontPanel Subsystem Vivado IP Core](https://docs.opalkelly.com/fphdl/vivado-ip-core/)
  v1.0 Rev 4 or later
- [XEM8320-AU25P board file](https://docs.opalkelly.com/fphdl/vivado-board-files/)
  v1.2 or later

## Build

From this folder, run the build script:

    Linux:    ./project.sh
    Windows:  project.bat

When Vivado opens, Generate the bitstream.


Copyright (c) 2026 Opal Kelly Incorporated
