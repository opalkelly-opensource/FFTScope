FFTScope chains three instruments: a tone-summing waveform generator feeds the DAC, the oscilloscope captures the ADC input in the time domain, and the spectrum analyzer displays the FFT of that same capture.

# Compatibility

## Host Boards

* [XEM8320](https://opalkelly.com/products/xem8320/)
* [SZG-HUB1450-AU10P](https://opalkelly.com/products/szg-hub1450-au10p/)

## SYZYGY Peripherals

* [SZG-DAC-AD911X](https://opalkelly.com/products/szg-dac-ad911x/) - Must be attached at Port A.
* [SZG-ADC-LTC226X](https://opalkelly.com/products/szg-adc-ltc226x/) - Must be attached at Port B.

## Operating Modes

On either host board, the app selects one of three modes from whichever of the two peripherals are attached:

* **Full** — DAC on Port A and ADC on Port B. Waveform Generator, Oscilloscope, and Spectrum Analyzer are all active.
* **DAC-only** — DAC on Port A only. The Waveform Generator is active.
* **ADC-only** — ADC on Port B only. The Oscilloscope and Spectrum Analyzer are active.

# Usage

## Waveform Generator

Drives both DAC channels with a sum of up to eight user-configurable tones.

* Enable or disable a tone with its switch.
* Drag a tone's vector left/right to change its frequency, or up/down to change its amplitude.
* Turn on 'Autoscale' to scale the output so the summed signal does not clip the DAC.

## Oscilloscope

Shows the dual-channel ADC waveform in the time domain.

* Toggle Channel 1 or Channel 2 to show or hide each channel in the chart.
* Turn on 'Continuous' for periodic captures, or leave it off and click 'Capture' for a single capture.
* Click 'Reset' to return the oscilloscope to its idle state.

## Spectrum Analyzer

Plots FFT magnitude versus frequency (MHz) for both ADC channels.

* Updates are driven by the oscilloscope capture.
* Continuous capture keeps the spectrum live; a single capture produces a snapshot.

## Version History

* 1.1.1
  * Updated FFTScope app icon
  * Updated FFTScope to use new packaging script
* 1.1.0 (released 2026-04-20)
  * Add SZG-HUB1450-AU10P host board support
  * Add spectrogram mode with floor (dBFS) and contrast (gamma) adjustments
  * Gateware built with Vivado 2025.2
  * Bug fixes and general cleanup
* 1.0.0 (released 2026-04-14)
  * Initial release
