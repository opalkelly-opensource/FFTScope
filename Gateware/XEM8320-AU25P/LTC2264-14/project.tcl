#----------------------------------------------------------------------
# project.tcl
#
# Project creation script for FFTScope (LTC2264-14 variant).
# Builds the Vivado project, configures the required IP cores,
# constructs the IPI block design, and generates the top wrapper.
#
# Copyright (c) 2024 Opal Kelly Incorporated
#----------------------------------------------------------------------

#--- Check FrontPanel Vivado IP Core path --------------------------------
# Accept either (a) fpdir set via TCL console before sourcing, or
# (b) the path passed as the first tclarg (used by project.bat/project.sh).
if {![info exists fpdir]} {
    if {[llength $argv] >= 1} {
        set fpdir [lindex $argv 0]
    } else {
        puts "ERROR: You must set the 'fpdir' variable before running this script."
        puts "Use the command: 'set fpdir <dir>'"
        error "Missing FrontPanel Vivado IP Core path."
    }
}

#--- Project creation ----------------------------------------------------
set project_name "FFTScope"
set project_dir  "v"

start_gui

#--- Verify required board file is installed ----------------------------
set found 0
set foundBoard none
set maxVersion "1.1" ;# start just below your threshold
foreach item [split [get_board_parts] " "] {
    set parts [split $item ":"]
    if {[lindex $parts 1] eq "xem8320-au25p"} {
        set currVersion [lindex $parts 3]
        if {$currVersion >= "1.2" && $currVersion > $maxVersion} {
            set found 1
            set foundBoard $item
            set maxVersion $currVersion
        }
    }
}
if {!$found} {
    puts "\nError: At least XEM8320-AU25P board file version 1.2 is required."
    puts "Please install the board file. For more information see:"
    puts "https://docs.opalkelly.com/fphdl/vivado-board-files/"
    return
}

create_project $project_name $project_dir -part xcau25p-ffvb676-2-e
set_property board_part opalkelly.com:xem8320-au25p:part0:1.2 [current_project]

#--- Set IP repositories (HLS outputs + FrontPanel) ----------------------
set_property ip_repo_paths [list \
    ./hls/fft/vitis/solution1/impl/ip \
    ./hls/ifft/vitis/solution1/impl/ip \
    ./interfaces \
    $fpdir \
] [current_project]
update_ip_catalog -rebuild
update_compile_order -fileset sources_1

#--- Verify FrontPanel Subsystem Vivado IP Core version -----------------
# Get version and revision
set version [get_property VERSION [get_ipdefs opalkelly.com:ip:frontpanel:*]]
set revision [get_property CORE_REVISION [get_ipdefs opalkelly.com:ip:frontpanel:*]]

# Break version into major and minor numbers
regexp {(\d+)\.(\d+)} $version -> major minor

# Compare
if { ($major < 1) ||
     ($major == 1 && $minor == 0 && $revision < 4) } {
    puts "Error: At least FrontPanel Subsystem Vivado IP Core Version 1.0 Rev 4 is required."
    puts "Please update your IP core. To download, go to our documentation at:"
    puts "https://docs.opalkelly.com/fphdl/vivado-ip-core/"
    return
} else {
    puts "FrontPanel Subsystem Vivado IP Core version and revision meet the requirements."
}

#--- Add HDL sources -----------------------------------------------------
add_files -norecurse [list \
    ./rtl/spectrum_analyzer.v \
    ./rtl/waveform_generator.v \
    ./rtl/fft_controller.v \
    ./rtl/ifft_controller.v \
    ./rtl/digitizer.v \
    ./rtl/cdc_sync_2ff.v \
    ./rtl/adc/adc_top.v \
    ./rtl/adc/adc_phy.v \
    ./rtl/adc/adc_frame.v \
    ./rtl/adc/adc_enc.v \
    ./rtl/adc/adc_dco.v \
    ./rtl/adc/bitslip_detect.v \
    ./rtl/adc/bitslip_shift.v \
    ./rtl/dac/dac_top.v \
    ./rtl/dac/dac_phy.v \
    ./rtl/dac/dac_spi.v \
    ./rtl/dac/dac_controller.v \
    ./rtl/dac/dac_data_reg.v \
]

#--- Add constraints -----------------------------------------------------
add_files -fileset constrs_1 -norecurse xem8320-au25p.xdc

#--- Create Xilinx IPs (non-block-design) --------------------------------
create_ip -name blk_mem_gen -vendor xilinx.com -library ip -module_name blk_mem_gen_0
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

update_compile_order -fileset sources_1

create_ip -name fifo_generator -vendor xilinx.com -library ip -module_name fifo_generator_0
set_property -dict [list \
  CONFIG.Fifo_Implementation {Independent_Clocks_Block_RAM} \
  CONFIG.Input_Data_Width {32} \
  CONFIG.Input_Depth {4096} \
  CONFIG.Output_Data_Width {32} \
  CONFIG.Output_Depth {4096} \
  CONFIG.Reset_Type {Asynchronous_Reset} \
  CONFIG.Full_Flags_Reset_Value {1} \
  CONFIG.Programmable_Full_Type {Single_Programmable_Full_Threshold_Constant} \
  CONFIG.Full_Threshold_Assert_Value {1024} \
  CONFIG.Full_Threshold_Negate_Value {1023} \
  CONFIG.Use_Embedded_Registers {false} \
  CONFIG.Enable_Safety_Circuit {true} \
] [get_ips fifo_generator_0]
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/fifo_generator_0/fifo_generator_0.xci]

create_ip -name fifo_generator -vendor xilinx.com -library ip -module_name fifo_generator_1
set_property -dict [list \
  CONFIG.Component_Name {fifo_generator_1} \
  CONFIG.Empty_Threshold_Assert_Value {1018} \
  CONFIG.Fifo_Implementation {Independent_Clocks_Builtin_FIFO} \
  CONFIG.Input_Data_Width {32} \
  CONFIG.Input_Depth {2048} \
  CONFIG.Output_Data_Width {16} \
  CONFIG.Programmable_Empty_Type {Single_Programmable_Empty_Threshold_Constant} \
  CONFIG.Read_Clock_Frequency {125} \
  CONFIG.Write_Clock_Frequency {100} \
  CONFIG.asymmetric_port_width {true} \
] [get_ips fifo_generator_1]
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/fifo_generator_1/fifo_generator_1.xci]

create_ip -name fifo_generator -vendor xilinx.com -library ip -module_name fifo_generator_2
set_property -dict [list \
  CONFIG.Component_Name {fifo_generator_2} \
  CONFIG.Fifo_Implementation {Independent_Clocks_Builtin_FIFO} \
  CONFIG.Full_Threshold_Assert_Value {1024} \
  CONFIG.Input_Data_Width {64} \
  CONFIG.Input_Depth {2048} \
  CONFIG.Output_Data_Width {32} \
  CONFIG.Programmable_Full_Type {Single_Programmable_Full_Threshold_Constant} \
  CONFIG.Read_Clock_Frequency {100} \
  CONFIG.Write_Clock_Frequency {125} \
  CONFIG.asymmetric_port_width {true} \
] [get_ips fifo_generator_2]
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/fifo_generator_2/fifo_generator_2.xci]

update_compile_order -fileset sources_1

#--- HLS IP instances (rfft + irfft) -------------------------------------
# IP definitions live under the HLS output dirs in ip_repo_paths above.
create_ip -name rfft -vendor opalkelly.com -library ip -version 1.0 -module_name rfft_0
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/rfft_0/rfft_0.xci]
update_compile_order -fileset sources_1

create_ip -name irfft -vendor opalkelly.com -library ip -version 1.0 -module_name irfft_0
generate_target {instantiation_template} [get_files v/FFTScope.srcs/sources_1/ip/irfft_0/irfft_0.xci]
update_compile_order -fileset sources_1

#--- Create block design -------------------------------------------------
set design_name $project_name
create_bd_design $design_name
current_bd_design $design_name

# Create interface ports
set board_leds [ create_bd_intf_port -mode Master -vlnv opalkelly.com:interface:led_rtl:1.0 board_leds ]

set host_interface [ create_bd_intf_port -mode Slave -vlnv opalkelly.com:interface:host_interface_rtl:1.0 host_interface ]

set szg_adc_ltc226x [ create_bd_intf_port -mode Master -vlnv opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x ]
set szg_dac_ad911x  [ create_bd_intf_port -mode Master -vlnv opalkelly.com:interface:szg_dac_ad911x_rtl:1.0  szg_dac_ad911x ]

# Create instance: clk_wiz_0, and set properties
set clk_wiz_0 [ create_bd_cell -type ip -vlnv xilinx.com:ip:clk_wiz clk_wiz_0 ]
set_property -dict [list \
  CONFIG.CLKIN1_JITTER_PS {99.2} \
  CONFIG.CLKOUT1_JITTER {227.404} \
  CONFIG.CLKOUT1_PHASE_ERROR {388.860} \
  CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {125} \
  CONFIG.CLKOUT2_JITTER {227.404} \
  CONFIG.CLKOUT2_PHASE_ERROR {388.860} \
  CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {125} \
  CONFIG.CLKOUT2_REQUESTED_PHASE {-101} \
  CONFIG.CLKOUT2_USED {true} \
  CONFIG.CLK_IN1_BOARD_INTERFACE {Custom} \
  CONFIG.MMCM_CLKFBOUT_MULT_F {78.125} \
  CONFIG.MMCM_CLKIN1_PERIOD {9.921} \
  CONFIG.MMCM_CLKOUT0_DIVIDE_F {9.000} \
  CONFIG.MMCM_CLKOUT1_DIVIDE {9} \
  CONFIG.MMCM_CLKOUT1_PHASE {-100.000} \
  CONFIG.MMCM_DIVCLK_DIVIDE {7} \
  CONFIG.NUM_OUT_CLKS {2} \
  CONFIG.PRIM_IN_FREQ {100.8} \
  CONFIG.PRIM_SOURCE {Single_ended_clock_capable_pin} \
  CONFIG.RESET_PORT {reset} \
  CONFIG.RESET_TYPE {ACTIVE_HIGH} \
  CONFIG.USE_BOARD_FLOW {true} \
] $clk_wiz_0

# Create instance: spectrum_analyzer_0 -- wraps fft_controller + rfft IP.
# Hides the individual nets between the controller and the FFT IP plus
# the GND ties for unused FFT IP secondary ports.
set block_name spectrum_analyzer
set block_cell_name spectrum_analyzer_0
if { [catch {set spectrum_analyzer_0 [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 } elseif { $spectrum_analyzer_0 eq "" } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 }

# Create instance: waveform_generator_0 -- wraps ifft_controller + irfft IP +
# dac_top. Hides the IFFT control nets and the IFFT->DAC data-path nets.
# Owns FrontPanel endpoints WI 0x00, WO 0x20, TI 0x40, register_bridge.
set block_name waveform_generator
set block_cell_name waveform_generator_0
if { [catch {set waveform_generator_0 [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 } elseif { $waveform_generator_0 eq "" } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 }

set_property -dict [ list \
 CONFIG.PHASE {90} \
] [get_bd_pins /waveform_generator_0/dac_clk_o]

set_property -dict [ list \
 CONFIG.POLARITY {ACTIVE_HIGH} \
] [get_bd_pins /waveform_generator_0/clk_wiz_reset]

# Create instance: frontpanel_0, and set properties
# Endpoint allocation (Phase 4 — each subblock owns its own endpoints):
#   waveform_generator_0 :  WI 0x00, WO 0x20, TI 0x40, register_bridge
#   digitizer_0   :  WI 0x01, WO 0x21, TI 0x42, PO 0xa0
#   spectrum_analyzer_0:  WI 0x02, WO 0x22, TI 0x41, PI 0x80, PO 0xa1
set frontpanel_0 [ create_bd_cell -type ip -vlnv opalkelly.com:ip:frontpanel frontpanel_0 ]
set_property -dict [list \
  CONFIG.PI.ADDR_0 {0x80} \
  CONFIG.PI.COUNT {1} \
  CONFIG.PO.ADDR_0 {0xa0} \
  CONFIG.PO.ADDR_1 {0xa1} \
  CONFIG.PO.COUNT {2} \
  CONFIG.RB.EN {true} \
  CONFIG.TI.ADDR_0 {0x40} \
  CONFIG.TI.ADDR_1 {0x41} \
  CONFIG.TI.ADDR_2 {0x42} \
  CONFIG.TI.COUNT {3} \
  CONFIG.WI.ADDR_0 {0x00} \
  CONFIG.WI.ADDR_1 {0x01} \
  CONFIG.WI.ADDR_2 {0x02} \
  CONFIG.WI.COUNT {3} \
  CONFIG.WO.ADDR_0 {0x20} \
  CONFIG.WO.ADDR_1 {0x21} \
  CONFIG.WO.ADDR_2 {0x22} \
  CONFIG.WO.COUNT {3} \
  CONFIG.host_interface_BOARD_INTERFACE {host_interface} \
] $frontpanel_0

# Create instance: leds_0, and set properties
set leds_0 [ create_bd_cell -type ip -vlnv opalkelly.com:ip:leds leds_0 ]
set_property -dict [list \
  CONFIG.IOSTANDARD {LVCMOS18} \
  CONFIG.LED_OUT_BOARD_INTERFACE {board_leds} \
] $leds_0

# Create instance: digitizer_0, and set properties
set block_name digitizer
set block_cell_name digitizer_0
if { [catch {set digitizer_0 [create_bd_cell -type module -reference $block_name $block_cell_name] } errmsg] } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2095 -severity "ERROR" "Unable to add referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 } elseif { $digitizer_0 eq "" } {
   catch {common::send_gid_msg -ssname BD::TCL -id 2096 -severity "ERROR" "Unable to referenced block <$block_name>. Please add the files for ${block_name}'s definition into the project."}
   return 1
 }

# Create instance: xlconcat_0, and set properties
set xlconcat_0 [ create_bd_cell -type ip -vlnv xilinx.com:ip:xlconcat xlconcat_0 ]
set_property CONFIG.IN1_WIDTH {5} $xlconcat_0


# Create interface connections
# Each subblock owns its own FrontPanel endpoints (Phase 4 -- no slicer).
connect_bd_intf_net -intf_net frontpanel_0_register_bridge [get_bd_intf_pins frontpanel_0/register_bridge] [get_bd_intf_pins waveform_generator_0/register_bridge]
connect_bd_intf_net -intf_net frontpanel_0_pipein80 [get_bd_intf_pins frontpanel_0/pipein80] [get_bd_intf_pins spectrum_analyzer_0/pipein80]
connect_bd_intf_net -intf_net frontpanel_0_pipeouta0 [get_bd_intf_pins frontpanel_0/pipeouta0] [get_bd_intf_pins digitizer_0/pipeouta0]
connect_bd_intf_net -intf_net frontpanel_0_pipeouta1 [get_bd_intf_pins frontpanel_0/pipeouta1] [get_bd_intf_pins spectrum_analyzer_0/pipeouta1]
connect_bd_intf_net -intf_net frontpanel_0_triggerin40 [get_bd_intf_pins frontpanel_0/triggerin40] [get_bd_intf_pins waveform_generator_0/triggerin40]
connect_bd_intf_net -intf_net frontpanel_0_triggerin41 [get_bd_intf_pins frontpanel_0/triggerin41] [get_bd_intf_pins spectrum_analyzer_0/triggerin41]
connect_bd_intf_net -intf_net frontpanel_0_triggerin42 [get_bd_intf_pins frontpanel_0/triggerin42] [get_bd_intf_pins digitizer_0/triggerin42]
connect_bd_intf_net -intf_net frontpanel_0_wirein00 [get_bd_intf_pins frontpanel_0/wirein00] [get_bd_intf_pins waveform_generator_0/wirein00]
connect_bd_intf_net -intf_net frontpanel_0_wirein01 [get_bd_intf_pins frontpanel_0/wirein01] [get_bd_intf_pins digitizer_0/wirein01]
connect_bd_intf_net -intf_net frontpanel_0_wirein02 [get_bd_intf_pins frontpanel_0/wirein02] [get_bd_intf_pins spectrum_analyzer_0/wirein02]
connect_bd_intf_net -intf_net frontpanel_0_wireout20 [get_bd_intf_pins frontpanel_0/wireout20] [get_bd_intf_pins waveform_generator_0/wireout20]
connect_bd_intf_net -intf_net frontpanel_0_wireout21 [get_bd_intf_pins frontpanel_0/wireout21] [get_bd_intf_pins digitizer_0/wireout21]
connect_bd_intf_net -intf_net frontpanel_0_wireout22 [get_bd_intf_pins frontpanel_0/wireout22] [get_bd_intf_pins spectrum_analyzer_0/wireout22]
connect_bd_intf_net -intf_net host_interface_1 [get_bd_intf_ports host_interface] [get_bd_intf_pins frontpanel_0/host_interface]
connect_bd_intf_net -intf_net leds_0_led_out [get_bd_intf_ports board_leds] [get_bd_intf_pins leds_0/led_out]

# Create port connections
connect_bd_intf_net -intf_net digitizer_0_szg_adc_ltc226x         [get_bd_intf_ports szg_adc_ltc226x] [get_bd_intf_pins digitizer_0/szg_adc_ltc226x]
connect_bd_intf_net -intf_net waveform_generator_0_szg_dac_ad911x [get_bd_intf_ports szg_dac_ad911x]  [get_bd_intf_pins waveform_generator_0/szg_dac_ad911x]
connect_bd_net -net clk_wiz_0_clk_out1 [get_bd_pins clk_wiz_0/clk_out1] [get_bd_pins spectrum_analyzer_0/fft_clk] [get_bd_pins waveform_generator_0/ifft_clk] [get_bd_pins digitizer_0/dac_clk]
connect_bd_net -net clk_wiz_0_clk_out2 [get_bd_pins clk_wiz_0/clk_out2] [get_bd_pins waveform_generator_0/dac_clk_shifted]
connect_bd_net -net clk_wiz_0_locked [get_bd_pins clk_wiz_0/locked] [get_bd_pins spectrum_analyzer_0/fft_clk_locked] [get_bd_pins waveform_generator_0/ifft_clk_locked] [get_bd_pins digitizer_0/locked] [get_bd_pins xlconcat_0/In0]
connect_bd_net -net waveform_generator_0_clk_wiz_reset [get_bd_pins waveform_generator_0/clk_wiz_reset] [get_bd_pins clk_wiz_0/reset]
connect_bd_net -net frontpanel_0_okClk [get_bd_pins clk_wiz_0/clk_in1] [get_bd_pins spectrum_analyzer_0/okClk] [get_bd_pins waveform_generator_0/okClk] [get_bd_pins frontpanel_0/okClk] [get_bd_pins digitizer_0/okClk]
connect_bd_net -net digitizer_0_led [get_bd_pins digitizer_0/led] [get_bd_pins xlconcat_0/In1]
connect_bd_net -net xlconcat_0_dout [get_bd_pins leds_0/led_in] [get_bd_pins xlconcat_0/dout]

# Validate and save the block design
validate_bd_design
save_bd_design

#--- Generate wrapper and set top ----------------------------------------
regenerate_bd_layout
make_wrapper -files [get_files ${project_name}.bd] -top -import
set_property top ${project_name}_wrapper [current_fileset]
update_compile_order -fileset sources_1
