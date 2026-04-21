############################################################################
# XEM8320 - Xilinx constraints file
#
# Pin mappings for the XEM8320.  Use this as a template and comment out
# the pins that are not used in your design.  (By default, map will fail
# if this file contains constraints for signals not in your design).
#
# Copyright (c) 2004-2024 Opal Kelly Incorporated
############################################################################

set_property CFGBVS GND [current_design]
set_property CONFIG_VOLTAGE 1.8 [current_design]
set_property BITSTREAM.GENERAL.COMPRESS True [current_design]

############################################################################
## SYZYGY Ports
############################################################################
## DAC ##
# PORTA-5
set_property PACKAGE_PIN AE25 [get_ports {szg_dac_ad911x_db[0]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[0]}]

# PORTA-6
set_property PACKAGE_PIN AD24 [get_ports {szg_dac_ad911x_db[1]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[1]}]

# PORTA-7
set_property PACKAGE_PIN AE26 [get_ports {szg_dac_ad911x_db[2]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[2]}]

# PORTA-8
set_property PACKAGE_PIN AD25 [get_ports {szg_dac_ad911x_db[3]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[3]}]

# PORTA-9
set_property PACKAGE_PIN AB25 [get_ports {szg_dac_ad911x_db[4]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[4]}]

# PORTA-10
set_property PACKAGE_PIN AA22 [get_ports {szg_dac_ad911x_db[5]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[5]}]

# PORTA-11
set_property PACKAGE_PIN AB26 [get_ports {szg_dac_ad911x_db[6]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[6]}]

# PORTA-12
set_property PACKAGE_PIN AB22 [get_ports {szg_dac_ad911x_db[7]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[7]}]

# PORTA-13
set_property PACKAGE_PIN AF24 [get_ports {szg_dac_ad911x_db[8]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[8]}]

# PORTA-14
set_property PACKAGE_PIN AB24 [get_ports {szg_dac_ad911x_db[9]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[9]}]

# PORTA-15
set_property PACKAGE_PIN AF25 [get_ports {szg_dac_ad911x_db[10]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[10]}]

# PORTA-16
set_property PACKAGE_PIN AC24 [get_ports {szg_dac_ad911x_db[11]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[11]}]

# PORTA-17
set_property PACKAGE_PIN AC26 [get_ports szg_dac_ad911x_cs_b]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_cs_b]

# PORTA-18
set_property PACKAGE_PIN AD21 [get_ports szg_dac_ad911x_sclk]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_sclk]

# PORTA-19
set_property PACKAGE_PIN AD26 [get_ports szg_dac_ad911x_sdio_io]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_sdio_io]

# PORTA-20

# PORTA-21
set_property PACKAGE_PIN AC16 [get_ports szg_dac_ad911x_reset_pinmd]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_reset_pinmd]

# PORTA-34
set_property PACKAGE_PIN AD23 [get_ports szg_dac_ad911x_clkin]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_clkin]

##########################################################
# ADC Section
##########################################################

# PORTB-5
set_property PACKAGE_PIN AA19 [get_ports {szg_adc_ltc226x_out1_p[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_p[0]}]

# PORTB-6
set_property PACKAGE_PIN Y20 [get_ports szg_adc_ltc226x_fr_p]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_fr_p]

# PORTB-7
set_property PACKAGE_PIN AB19 [get_ports {szg_adc_ltc226x_out1_n[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_n[0]}]

# PORTB-8
set_property PACKAGE_PIN Y21 [get_ports szg_adc_ltc226x_fr_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_fr_n]

# PORTB-9
set_property PACKAGE_PIN Y17 [get_ports {szg_adc_ltc226x_out1_p[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_p[1]}]

# PORTB-10
set_property PACKAGE_PIN Y18 [get_ports {szg_adc_ltc226x_out2_p[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_p[0]}]

# PORTB-11
set_property PACKAGE_PIN AA17 [get_ports {szg_adc_ltc226x_out1_n[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_n[1]}]

# PORTB-12
set_property PACKAGE_PIN AA18 [get_ports {szg_adc_ltc226x_out2_n[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_n[0]}]

# PORTB-13
set_property PACKAGE_PIN AE17 [get_ports szg_adc_ltc226x_sdo]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sdo]

# PORTB-14
set_property PACKAGE_PIN AA20 [get_ports {szg_adc_ltc226x_out2_p[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_p[1]}]

# PORTB-15
set_property PACKAGE_PIN AF17 [get_ports szg_adc_ltc226x_cs_b]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_cs_b]

# PORTB-16
set_property PACKAGE_PIN AB20 [get_ports {szg_adc_ltc226x_out2_n[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_n[1]}]

# PORTB-17
set_property PACKAGE_PIN AD16 [get_ports szg_adc_ltc226x_sclk]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sclk]

# PORTB-19
set_property PACKAGE_PIN AE16 [get_ports szg_adc_ltc226x_sdi]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sdi]

# PORTB-33
set_property PACKAGE_PIN AD20 [get_ports szg_adc_ltc226x_dco_p]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_dco_p]

# PORTB-34
set_property PACKAGE_PIN AF18 [get_ports szg_adc_ltc226x_enc_p]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_enc_p]

# PORTB-35
set_property PACKAGE_PIN AE20 [get_ports szg_adc_ltc226x_dco_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_dco_n]

# PORTB-36
set_property PACKAGE_PIN AF19 [get_ports szg_adc_ltc226x_enc_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_enc_n]

############################################################################
## LEDs
############################################################################
set_property PACKAGE_PIN D13 [get_ports {leds[0]}]
set_property PACKAGE_PIN E13 [get_ports {leds[1]}]
set_property PACKAGE_PIN F14 [get_ports {leds[2]}]
set_property PACKAGE_PIN G12 [get_ports {leds[3]}]
set_property IOSTANDARD LVCMOS18 [get_ports {leds[*]}]


############################################################################
## Timing
############################################################################

# DAC timing constraints
create_generated_clock -name dac_clk -source [get_ports szg_dac_ad911x_clkin] -divide_by 1 [get_ports szg_dac_ad911x_clkin]
set_output_delay -clock [get_clocks dac_clk] -clock_fall -max -add_delay 0.25 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -clock_fall -min -add_delay -1.2 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -max -add_delay 0.13 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -min -add_delay -1.1 [get_ports {szg_dac_ad911x_db[*]}]

# ADC timing constraints
create_clock -period 3.125 -name szg_adc_ltc226x_dco_p -waveform {0.000 1.5625} [get_ports szg_adc_ltc226x_dco_p]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out1_n[*]}]

set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports {szg_adc_ltc226x_out2_n[*]}]

set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports szg_adc_ltc226x_fr_p]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports szg_adc_ltc226x_fr_p]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports szg_adc_ltc226x_fr_p]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports szg_adc_ltc226x_fr_p]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 0.5469 [get_ports szg_adc_ltc226x_fr_n]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 1.0156 [get_ports szg_adc_ltc226x_fr_n]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 0.5469 [get_ports szg_adc_ltc226x_fr_n]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 1.0156 [get_ports szg_adc_ltc226x_fr_n]



set_false_path -to [get_cells -hierarchical -regex -filter {NAME =~ ".*cdc_sync_2ff_adc_rdy_i/ff1\_reg"}]
set_false_path -to [get_cells -hierarchical -regex -filter {NAME =~ ".*cdc_sync_2ff_fifo_busy_i/ff1\_reg"}]
set_false_path -to [get_cells -hierarchical -regex -filter {NAME =~ ".*cdc_sync_2ff_rsta_busy_i/ff1\_reg"}]
set_false_path -to [get_cells -hierarchical -regex -filter {NAME =~ ".*cdc_sync_2ff_reset_i/ff1\_reg"}]
