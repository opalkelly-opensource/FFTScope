# FrontPanel 6 FFTScope Application

## Overview

For more details on this sample, such as functionality and how-to guides, please visit the [documentation on our website.](https://docs.opalkelly.com/fpsdk/samples-and-tools/dac-adc-example-design/)

## MCP bindings

When the app is granted MCP bindings, FFTScope exposes 22 tools to external AI
assistants (Claude Desktop, Claude Code, MCP Inspector). Without the grant the
app runs exactly as it does from the UI. `mcp.json` holds the authoritative
JSON Schemas.

Every tool calls the same handler as the matching UI control, so a tool call
and a click update the same state and the UI follows MCP changes.

| File | Role |
|------|------|
| `frontpanel-app.json` | Declares `permissions.mcp.bindings`, `permissions.mcp.script`, and `mcp.descriptor`. |
| `mcp.json` | Tool names, descriptions, and argument schemas. |
| `src/types/mcp.ts` | `getMCP()` accessor for `window.FrontPanelAPI.mcp`. |
| `src/MCPBindings.ts` | Wires each tool to its App-level handler. |

### Waveform Generator

| Tool | Kind | Notes |
|------|------|-------|
| `wavegen_initialize` | action | Re-enable DAC playout and re-apply the current slots. |
| `wavegen_reset` | action | Silence the DAC and return all 8 slots to disabled / -120 dBFS. |
| `wavegen_set_vector` | write | Set one slot: `slot` 0..7, `bin` 0..1023, `amplitudeDbfs`, `enabled`. |
| `wavegen_set_autoscale` | write | Scale tones down so their summed linear amplitude stays at or below full scale. |
| `wavegen_get_state` | read | Slots with `freqHz`, autoscale enable, `amplitudeScaleFactor` / `amplitudeScaleDb`, staged bin map. |
| `wavegen_get_sample_rate` | read | DAC rate (125 MHz), IFFT length (2048), bin spacing (61.035 kHz). |

A tone's frequency is `bin * 125 MHz / 2048`, so bins 0..1023 cover DC to
Nyquist. The scale factor is a multiplier: three 0 dBFS tones report 0.333
(-9.54 dB), and each leaves the DAC 9.54 dB down.

### Digitizer

| Tool | Kind | Notes |
|------|------|-------|
| `digitizer_reset` | action | Realign the ADC, clear its sticky flags, resume continuous capture. |
| `digitizer_capture_once` | action | Capture one frame, refresh the charts, and return the samples. |
| `digitizer_read_samples` | read | Capture one frame and return 2048 MSB-aligned signed 16-bit samples per channel. |
| `digitizer_get_sample_rate` | read | ADC rate of the loaded variant, FFT length, bin spacing. |
| `digitizer_set_continuous` | write | Start/stop the ~35 ms capture loop. |
| `digitizer_set_channel_enabled` / `digitizer_get_channel_enabled` | write / read | Show/hide a channel in the time-domain chart. |

### Spectrum Analyzer

| Tool | Kind | Notes |
|------|------|-------|
| `spectrum_read_latest` | read | Capture one hardware FFT frame: 1024 dBFS bins per channel, DC to Nyquist. |
| `spectrum_set_mode` / `spectrum_get_mode` | write / read | `spectrum` or `spectrogram`. |
| `spectrum_set_noise_floor` / `spectrum_get_noise_floor` | write / read | Spectrogram floor, -130..-10 dBFS. |
| `spectrum_set_gamma` / `spectrum_get_gamma` | write / read | Spectrogram contrast, 0.25..4.0 in 1/8-octave steps. |

### Diagnostics

| Tool | Kind | Notes |
|------|------|-------|
| `status_read` | read | datapath_ctrl STATUS plus the decoded syzygy_adc and syzygy_dac status registers. |
| `config_read` | read | datapath_ctrl CONFIG: `dacEnable`, `pathSel`. |
