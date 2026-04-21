#----------------------------------------------------------------------
# project.tcl
#
# Project creation script.
#
# Copyright (c) 2026 Opal Kelly Incorporated
#----------------------------------------------------------------------

#--------------------------------------------------------------------------
# Check FrontPanel folder
#--------------------------------------------------------------------------

set fp_dir "./FrontPanel/BWMode3"

if {![file exists $fp_dir]} {
    puts "ERROR: 'FrontPanel/BWMode3' directory not found in current project directory."
    puts "Please ensure the following structure exists:"
    puts "    ./FrontPanel/BWMode3/okHost.vp"
    puts "    ./FrontPanel/BWMode3/okHost.xdc"
    puts ""
    puts "You can find these files for your product in the FrontPanel SDK"
    puts "under the 'FrontPanelHDL' directory."
    error "Missing FrontPanel HDL files for Bandwidth Mode 3."
}

#----------------------------------------------------------------------
# Project Creation
#----------------------------------------------------------------------

set project_name "FFTScope"
set project_dir  "v"

start_gui
create_project $project_name $project_dir -part xcau10p-ffvb676-1-e

# Add HDL sources
add_files -norecurse { \
./rtl/dac/dac_controller.v \
./rtl/dac/dac_phy.v \
./rtl/dac/dac_top.v \
./rtl/dac/dac_spi.v \
./rtl/ifft_controller.v \
./rtl/dac/dac_data_reg.v \
./rtl/adc/bitslip_detect.v \
./rtl/adc/bitslip_shift.v \
./rtl/fft_controller.v \
./rtl/adc/adc_dco.v \
./rtl/adc/adc_enc.v \
./rtl/adc/adc_frame.v \
./rtl/adc/adc_phy.v \
./rtl/adc/adc_top.v \
./rtl/spectrum_analyzer.v \
./rtl/waveform_generator.v \
./rtl/digitizer.v \
./rtl/okHost_if.v \
./rtl/csr/digitizer_csr.v \
./rtl/csr/spectrum_analyzer_csr.v \
./rtl/csr/waveform_generator_csr.v \
./rtl/cdc_sync_2ff.v \
}

# Add constraints
add_files -fileset constrs_1 -norecurse ./szg-hub1450-au10p.xdc

# Add IPs
create_ip -name blk_mem_gen -vendor xilinx.com -library ip -version 8.4 -module_name blk_mem_gen_0
set_property -dict [list \
  CONFIG.Enable_32bit_Address {false} \
  CONFIG.Memory_Type {True_Dual_Port_RAM} \
  CONFIG.Register_PortA_Output_of_Memory_Primitives {false} \
  CONFIG.Register_PortB_Output_of_Memory_Primitives {false} \
  CONFIG.Use_RSTA_Pin {true} \
  CONFIG.Use_RSTB_Pin {true} \
  CONFIG.Write_Depth_A {2048} \
  CONFIG.Write_Width_A {32} \
  CONFIG.Write_Width_B {64} \
] [get_ips blk_mem_gen_0]

create_ip -name blk_mem_gen -vendor xilinx.com -library ip -module_name blk_mem_gen_1
set_property -dict [list \
  CONFIG.Operating_Mode_A {READ_FIRST} \
  CONFIG.Register_PortA_Output_of_Memory_Primitives {false} \
  CONFIG.Use_RSTA_Pin {true} \
  CONFIG.Write_Depth_A {1024} \
  CONFIG.Write_Width_A {12} \
] [get_ips blk_mem_gen_1]

create_ip -name fifo_generator -vendor xilinx.com -library ip -version 13.2 -module_name fifo_generator_0
set_property -dict [list \
  CONFIG.Fifo_Implementation {Independent_Clocks_Block_RAM} \
  CONFIG.Full_Threshold_Assert_Value {1024} \
  CONFIG.Input_Data_Width {32} \
  CONFIG.Input_Depth {2048} \
  CONFIG.Output_Data_Width {64} \
  CONFIG.Programmable_Full_Type {Single_Programmable_Full_Threshold_Constant} \
  CONFIG.Use_Embedded_Registers {false} \
  CONFIG.asymmetric_port_width {true} \
] [get_ips fifo_generator_0]

create_ip -name fifo_generator -vendor xilinx.com -library ip -version 13.2 -module_name fifo_generator_1
set_property -dict [list \
  CONFIG.Empty_Threshold_Assert_Value {1018} \
  CONFIG.Fifo_Implementation {Independent_Clocks_Builtin_FIFO} \
  CONFIG.Input_Data_Width {32} \
  CONFIG.Output_Data_Width {16} \
  CONFIG.Programmable_Empty_Type {Single_Programmable_Empty_Threshold_Constant} \
  CONFIG.Read_Clock_Frequency {40} \
  CONFIG.Write_Clock_Frequency {156} \
  CONFIG.asymmetric_port_width {true} \
] [get_ips fifo_generator_1]

create_ip -name fifo_generator -vendor xilinx.com -library ip -version 13.2 -module_name fifo_generator_2
set_property -dict [list \
  CONFIG.Fifo_Implementation {Independent_Clocks_Distributed_RAM} \
  CONFIG.Full_Threshold_Assert_Value {1024} \
  CONFIG.Input_Data_Width {64} \
  CONFIG.Input_Depth {2048} \
  CONFIG.Performance_Options {First_Word_Fall_Through} \
  CONFIG.Programmable_Full_Type {Single_Programmable_Full_Threshold_Constant} \
] [get_ips fifo_generator_2]


#----------------------------------------------------------------------
# Set IP Repositories
#----------------------------------------------------------------------
set ip_paths {}
lappend ip_paths \
[list ./hls/fft/vitis/solution1/impl/ip] \
[list ./hls/ifft/vitis/solution1/impl/ip] \
[list ./ip_cores] \
[list ./interfaces]

set_property ip_repo_paths $ip_paths [current_project]
update_ip_catalog -rebuild

#----------------------------------------------------------------------
# HLS IP instances (rfft + irfft)
#----------------------------------------------------------------------
# IP definitions live under the HLS output dirs in ip_repo_paths above.
create_ip -name rfft -vendor opalkelly.com -library ip -version 1.0 -module_name rfft_0
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/rfft_0/rfft_0.xci]
update_compile_order -fileset sources_1

create_ip -name irfft -vendor opalkelly.com -library ip -version 1.0 -module_name irfft_0
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/irfft_0/irfft_0.xci]
update_compile_order -fileset sources_1

#----------------------------------------------------------------------
# Import FrontPanel HDL
#----------------------------------------------------------------------

puts "INFO: Importing FrontPanel sources for Bandwidth Mode 3 (10G Up / 2.5G Down)..."
add_files -norecurse [list "$fp_dir/okHost.vp"]
add_files -fileset constrs_1 -norecurse [list "$fp_dir/okHost.xdc"]

#----------------------------------------------------------------------
# Create Block Design
#----------------------------------------------------------------------

set design_name $project_name
create_bd_design $design_name
current_bd_design $design_name

# Create interface ports
set szg_adc_ltc226x [ create_bd_intf_port -mode Master -vlnv opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x ]
set szg_dac_ad911x  [ create_bd_intf_port -mode Master -vlnv opalkelly.com:interface:szg_dac_ad911x_rtl:1.0  szg_dac_ad911x ]

# Create ports
set okUHU [ create_bd_port -dir IO -from 5 -to 0 okUHU ]
set okHU [ create_bd_port -dir O -from 20 -to 0 okHU ]
set okUH [ create_bd_port -dir I -from 21 -to 0 okUH ]
set leds [ create_bd_port -dir O -from 3 -to 0 leds ]

# Create instance: clk_wiz, and set properties
set clk_wiz [ create_bd_cell -type ip -vlnv xilinx.com:ip:clk_wiz clk_wiz ]
set_property -dict [list \
CONFIG.CLKIN1_JITTER_PS {64.0} \
CONFIG.CLKOUT1_DRIVES {Buffer} \
CONFIG.CLKOUT1_JITTER {145.974} \
CONFIG.CLKOUT1_PHASE_ERROR {100.289} \
CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {40} \
CONFIG.CLKOUT2_DRIVES {Buffer} \
CONFIG.CLKOUT2_JITTER {145.974} \
CONFIG.CLKOUT2_PHASE_ERROR {100.289} \
CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {40} \
CONFIG.CLKOUT2_REQUESTED_PHASE {-30} \
CONFIG.CLKOUT2_USED {true} \
CONFIG.CLKOUT3_DRIVES {Buffer} \
CONFIG.CLKOUT3_REQUESTED_OUT_FREQ {100.000} \
CONFIG.CLKOUT4_DRIVES {Buffer} \
CONFIG.CLKOUT4_REQUESTED_OUT_FREQ {100.000} \
CONFIG.CLKOUT5_DRIVES {Buffer} \
CONFIG.CLKOUT5_REQUESTED_OUT_FREQ {100.000} \
CONFIG.CLKOUT6_DRIVES {Buffer} \
CONFIG.CLKOUT6_REQUESTED_OUT_FREQ {100.000} \
CONFIG.CLKOUT7_DRIVES {Buffer} \
CONFIG.CLKOUT7_REQUESTED_OUT_FREQ {100.000} \
CONFIG.MMCM_CLKFBOUT_MULT_F {5.375} \
CONFIG.MMCM_CLKIN1_PERIOD {6.400} \
CONFIG.MMCM_CLKIN2_PERIOD {10.0} \
CONFIG.MMCM_CLKOUT0_DIVIDE_F {21.000} \
CONFIG.MMCM_CLKOUT1_DIVIDE {21} \
CONFIG.MMCM_CLKOUT1_PHASE {-30.000} \
CONFIG.MMCM_DIVCLK_DIVIDE {1} \
CONFIG.NUM_OUT_CLKS {2} \
CONFIG.PRIM_IN_FREQ {156.25} \
CONFIG.SECONDARY_SOURCE {Single_ended_clock_capable_pin} \
CONFIG.USE_FREQ_SYNTH {true} \
CONFIG.USE_PHASE_ALIGNMENT {false} \
CONFIG.USE_RESET {false} \
] $clk_wiz


# Create instance: spectrum_analyzer -- wraps fft_controller + rfft IP.
# Hides the individual nets between the controller and the FFT IP plus
# the GND ties for unused FFT IP secondary ports.
set block_name spectrum_analyzer
set block_cell_name spectrum_analyzer
if { [catch {set spectrum_analyzer [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
} elseif { $spectrum_analyzer eq "" } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
}

# Create instance: waveform_generator -- wraps ifft_controller + irfft IP +
# dac_top. Hides the IFFT control nets and the IFFT->DAC data-path nets.
set block_name waveform_generator
set block_cell_name waveform_generator
if { [catch {set waveform_generator [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
} elseif { $waveform_generator eq "" } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
}

# Create instance: okHost_if, and set properties
set block_name okHost_if
set block_cell_name okHost_if
if { [catch {set okHost_if [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
} elseif { $okHost_if eq "" } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
}

set_property -dict [ list \
CONFIG.FREQ_HZ {156250000} \
] [get_bd_intf_pins $okHost_if/m_axi]

set_property -dict [ list \
CONFIG.FREQ_HZ {156250000} \
] [get_bd_intf_pins $okHost_if/m_axil]

set_property -dict [ list \
CONFIG.FREQ_HZ {156250000} \
] [get_bd_intf_pins $okHost_if/m_axis]

set_property -dict [ list \
CONFIG.FREQ_HZ {156250000} \
] [get_bd_intf_pins $okHost_if/s_axis]

set_property -dict [ list \
CONFIG.FREQ_HZ {156250000} \
] [get_bd_pins $okHost_if/aclk]

# Create instance: axis_switch, and set properties
set axis_switch [ create_bd_cell -type ip -vlnv xilinx.com:ip:axis_switch axis_switch ]
set_property CONFIG.ROUTING_MODE {1} $axis_switch


# Create instance: smartconnect, and set properties
set smartconnect [ create_bd_cell -type ip -vlnv xilinx.com:ip:smartconnect smartconnect ]
set_property -dict [list \
CONFIG.NUM_CLKS {3} \
CONFIG.NUM_MI {4} \
CONFIG.NUM_SI {1} \
] $smartconnect


# Create instance: proc_sys_reset_1, and set properties
set proc_sys_reset_1 [ create_bd_cell -type ip -vlnv xilinx.com:ip:proc_sys_reset proc_sys_reset_1 ]

# Create instance: tie_high, and set properties
set tie_high [ create_bd_cell -type ip -vlnv xilinx.com:ip:xlconstant tie_high ]

# Create instance: digitizer, and set properties
set block_name digitizer
set block_cell_name digitizer
if { [catch {set digitizer [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
} elseif { $digitizer eq "" } {
 catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
 return 1
}

# Create instance: proc_sys_reset_0, and set properties
set proc_sys_reset_0 [ create_bd_cell -type ip -vlnv xilinx.com:ip:proc_sys_reset proc_sys_reset_0 ]

# Create interface connections
connect_bd_intf_net -intf_net digitizer_m_axis [get_bd_intf_pins digitizer/m_axis] [get_bd_intf_pins axis_switch/S00_AXIS]
connect_bd_intf_net -intf_net axis_switch_0_M00_AXIS [get_bd_intf_pins axis_switch/M00_AXIS] [get_bd_intf_pins okHost_if/s_axis]
connect_bd_intf_net -intf_net spectrum_analyzer_m_axis [get_bd_intf_pins spectrum_analyzer/m_axis] [get_bd_intf_pins axis_switch/S01_AXIS]
connect_bd_intf_net -intf_net okHost_if_0_m_axil [get_bd_intf_pins okHost_if/m_axil] [get_bd_intf_pins smartconnect/S00_AXI]
connect_bd_intf_net -intf_net okHost_if_0_m_axis [get_bd_intf_pins spectrum_analyzer/s_axis] [get_bd_intf_pins okHost_if/m_axis]
connect_bd_intf_net -intf_net smartconnect_0_M01_AXI [get_bd_intf_pins waveform_generator/m_axil] [get_bd_intf_pins smartconnect/M01_AXI]
connect_bd_intf_net -intf_net smartconnect_0_M02_AXI [get_bd_intf_pins smartconnect/M02_AXI] [get_bd_intf_pins spectrum_analyzer/m_axil]
connect_bd_intf_net -intf_net smartconnect_0_M03_AXI [get_bd_intf_pins smartconnect/M03_AXI] [get_bd_intf_pins axis_switch/S_AXI_CTRL]
connect_bd_intf_net -intf_net smartconnect_M00_AXI [get_bd_intf_pins smartconnect/M00_AXI] [get_bd_intf_pins digitizer/m_axil]

# Create port connections
connect_bd_intf_net -intf_net digitizer_szg_adc_ltc226x         [get_bd_intf_ports szg_adc_ltc226x] [get_bd_intf_pins digitizer/szg_adc_ltc226x]
connect_bd_intf_net -intf_net waveform_generator_szg_dac_ad911x [get_bd_intf_ports szg_dac_ad911x]  [get_bd_intf_pins waveform_generator/szg_dac_ad911x]
connect_bd_net -net Net1  [get_bd_ports okUHU] \
[get_bd_pins okHost_if/okUHU]
connect_bd_net -net adc_top_adc_data_clk  [get_bd_pins digitizer/adc_data_clk] \
[get_bd_pins smartconnect/aclk2] \
[get_bd_pins digitizer/aclk] \
[get_bd_pins proc_sys_reset_0/slowest_sync_clk]
connect_bd_net -net adc_top_led  [get_bd_pins digitizer/led] \
[get_bd_ports leds]
connect_bd_net -net clk_wiz_0_clk_out1  [get_bd_pins clk_wiz/clk_out1] \
[get_bd_pins proc_sys_reset_1/slowest_sync_clk] \
[get_bd_pins smartconnect/aclk1] \
[get_bd_pins digitizer/dac_clk] \
[get_bd_pins spectrum_analyzer/aclk] \
[get_bd_pins spectrum_analyzer/fft_clk] \
[get_bd_pins waveform_generator/aclk] \
[get_bd_pins waveform_generator/ifft_clk]
connect_bd_net -net clk_wiz_0_clk_out2  [get_bd_pins clk_wiz/clk_out2] \
[get_bd_pins waveform_generator/dac_clk_shifted]
connect_bd_net -net clk_wiz_0_locked  [get_bd_pins clk_wiz/locked] \
[get_bd_pins spectrum_analyzer/fft_clk_locked] \
[get_bd_pins waveform_generator/ifft_clk_locked]
connect_bd_net -net frontpanel_0_okClk  [get_bd_pins okHost_if/aclk] \
[get_bd_pins clk_wiz/clk_in1] \
[get_bd_pins axis_switch/aclk] \
[get_bd_pins smartconnect/aclk] \
[get_bd_pins axis_switch/s_axi_ctrl_aclk] \
[get_bd_pins digitizer/okClk] \
[get_bd_pins spectrum_analyzer/okClk]
connect_bd_net -net okHost_if_0_axil_aresetn  [get_bd_pins okHost_if/axil_aresetn] \
[get_bd_pins smartconnect/aresetn] \
[get_bd_pins axis_switch/s_axi_ctrl_aresetn] \
[get_bd_pins proc_sys_reset_1/ext_reset_in] \
[get_bd_pins proc_sys_reset_0/ext_reset_in]
connect_bd_net -net okHost_if_0_axis_aresetn  [get_bd_pins okHost_if/axis_aresetn] \
[get_bd_pins axis_switch/aresetn]
connect_bd_net -net okHost_if_0_okHU  [get_bd_pins okHost_if/okHU] \
[get_bd_ports okHU]
connect_bd_net -net okUH_0_1  [get_bd_ports okUH] \
[get_bd_pins okHost_if/okUH]
connect_bd_net -net proc_sys_reset_0_peripheral_aresetn  [get_bd_pins proc_sys_reset_1/peripheral_aresetn] \
[get_bd_pins spectrum_analyzer/aresetn] \
[get_bd_pins waveform_generator/aresetn]
connect_bd_net -net proc_sys_reset_0_peripheral_aresetn1  [get_bd_pins proc_sys_reset_0/peripheral_aresetn] \
[get_bd_pins digitizer/aresetn]
connect_bd_net -net tie_high_dout  [get_bd_pins tie_high/dout] \
[get_bd_pins proc_sys_reset_1/dcm_locked] \
[get_bd_pins proc_sys_reset_0/dcm_locked]

# Create address segments
assign_bd_address -offset 0x00001000 -range 0x00001000 -target_address_space [get_bd_addr_spaces okHost_if/m_axil] [get_bd_addr_segs digitizer/m_axil/reg0] -force
assign_bd_address -offset 0x44A00000 -range 0x00010000 -with_name SEG_axis_switch_0_Reg -target_address_space [get_bd_addr_spaces okHost_if/m_axil] [get_bd_addr_segs axis_switch/S_AXI_CTRL/Reg] -force
assign_bd_address -offset 0x00000000 -range 0x00001000 -with_name SEG_spectrum_analyzer_reg0 -target_address_space [get_bd_addr_spaces okHost_if/m_axil] [get_bd_addr_segs spectrum_analyzer/m_axil/reg0] -force
assign_bd_address -offset 0x00004000 -range 0x00004000 -with_name SEG_waveform_generator_reg0 -target_address_space [get_bd_addr_spaces okHost_if/m_axil] [get_bd_addr_segs waveform_generator/m_axil/reg0] -force

# Wrapper and Top
regenerate_bd_layout
set wrapperfile [make_wrapper -files [get_files ${project_name}.bd] -top -import]
set_property top ${project_name}_wrapper [current_fileset]
update_compile_order -fileset sources_1
