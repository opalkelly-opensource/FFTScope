Vivado IP Cores
===============

This design needs three IP cores that are not included here. Copy each into
this directory:

1. FrontPanel Vivado IP distribution, v1.1.0 or later. Download it from
   Opal Kelly Pins. See https://docs.opalkelly.com/fphdl/vivado-ip-core/

2. SYZYGY DAC IP (syzygy-dac) and SYZYGY ADC IP (syzygy-adc). Download the
   Syzygy-IP folder from the design-resources repository, or get the cores
   from Opal Kelly Pins:

      https://github.com/opalkelly-opensource/design-resources

   Any release works. Newer releases are backwards compatible.

The result should look like:

   IP/
       FrontPanel-Vivado-IP-Dist-v1.1.0/
       syzygy-adc/
       syzygy-dac/

Vivado searches this directory recursively, so the folder names do not
matter.

See the parent README.md for full build instructions.


Copyright (c) 2026 Opal Kelly Incorporated
