FFTScope gateware, 14-bit variant: SZG-ADC-LTC2268-14 on PORT B at 125 MSPS, with the
SZG-DAC-AD9116 on PORT A, on the SZG-HUB1450-AU10P.

The IP cores this design uses are a separate download and are not included here.


To generate the bitstream:

1. Copy the FrontPanel Vivado IP distribution and the SYZYGY ADC and DAC IP cores into
   the IP directory. IP/README.txt lists where to get each one. The result should
   look like:

      ./IP/FrontPanel-Vivado-IP-Dist-v1.1.0/
      ./IP/syzygy-adc/
      ./IP/syzygy-dac/

2. From the Vivado TCL console, change to this project directory:
      cd <path to this directory>

3. Run the project script:
      source project.tcl

   The project is created in ./vivado. Set FFTSCOPE_OUT=<dir> before starting Vivado
   to create it somewhere else.

4. Generate the bitstream. The top module is fftscope_14, so the bitstream is
   fftscope_14.bit.


Copyright (c) 2026 Opal Kelly Incorporated
