# FrontPanel 6 FFTScope Application

## Overview

For more details on this sample, such as functionality and how-to guides, please visit the [documentation on our website.](https://docs.opalkelly.com/fpsdk/samples-and-tools/sample-fft-signal-generator/)

## MCP bindings

FFTScope is a multi-instrument reference for FrontPanel's Model Context
Protocol (MCP) integration: a waveform generator, a digitizer, and a
spectrum analyzer, each with several controls and read-outs. When a
user grants the app MCP bindings, FFTScope exposes 21 tools to external
AI assistants (Claude Desktop, Claude Code, IDE integrations, MCP
Inspector, etc.) covering all three instruments.

The integration is opt-in. An MCP-disabled launch behaves exactly like
the pre-MCP FFTScope: nothing in the AI surface is exposed, no extra
cost.

The pattern is the same one Counters established (see
`frontpanel-samples/Counters/FP-Platform/README.md` for the canonical
small-app walk-through). FFTScope is the meatier example: more tools,
more state to keep in sync, and big-array reads.

### What's in the sample

| File | Role |
|------|------|
| `frontpanel-app.json` | Manifest opt-in: declares `permissions.mcp.bindings: true`, `permissions.mcp.script: true`, and points at `mcp.descriptor`. |
| `mcp.json` | Tool inventory: 21 tools across the three instruments, each with a JSON Schema for its arguments. |
| `src/types/mcp.ts` | Local types and the `getMCP()` accessor for `window.FrontPanelAPI.mcp`. |
| `src/MCPBindings.ts` | Where each tool's handler is wired to the App-level shared handlers, drivers, and buffer refs. |

### Tool surface

Twenty-one tools across three instruments (seven each). Inputs and
shapes match `mcp.json`; consult that file for the authoritative JSON
Schemas.

#### Waveform Generator (7 tools)

| Tool | Kind | Notes |
|------|------|-------|
| `waveform_initialize` | action | Bring up the IFFT engine. Re-pushes the saved vectors. |
| `waveform_reset` | action | Clear all 8 vector slots and silence the IFFT. |
| `waveform_set_vector` | write | Configure one of the 8 vector slots: bin, dBFS amplitude, enabled. Use bins 0..511 — see below. |
| `waveform_set_autoscale` | write | Toggle autoscaling to keep the IFFT output unclipped. |
| `waveform_get_vectors` | read | All 8 slot states with bin, frequency, dBFS, enabled. |
| `waveform_get_sample_rate` | read | DAC sample rate, IFFT length, and per-bin frequency spacing. |
| `waveform_get_amplitude_scale` | read | Current autoscale factor, linear and dB. A *multiplier* (<1.0 attenuates), not a divisor — see below. |

`waveform_set_vector` accepts bins 0..1023, but only 0..511 are
distinct frequencies. The IFFT is real, so bins 512..1023 are the
conjugate mirror and emit exactly the same tone as bin `1024 - bin`:
setting bin 800 produces the same 17.5 MHz output as bin 224, at the
same level. The digitizer's spectrum covers DC..Nyquist (bins 0..511)
only, so a mirrored bin appears at its folded index and never at the
number you asked for. Keep sweeps at or below 511.

Autoscale only engages when the enabled vectors' **linear** amplitudes
sum above 1.0; below that the scale stays at 1.0 and nothing is
attenuated. When it does engage, `scale` is `1 / sum`, and every tone
leaves the DAC `scale_db` lower than its requested `amplitude_dbfs`.
Three 0 dBFS tones report `scale` 0.333 / `scale_db` -9.54, so each
arrives 9.54 dB down. Multiply by `scale` to predict the output level;
dividing gets the sign backwards.

Note that a script cannot A/B this by toggling autoscale off at the
same amplitudes: the exact condition that makes autoscale engage
(sum > 1.0) is the condition that clips the IFFT when it is off, so the
autoscale-off capture is a clipped, intermodulated reference. Compare
two *different* amplitude sets with autoscale left on instead.

#### Digitizer (7 tools)

| Tool | Kind | Notes |
|------|------|-------|
| `digitizer_reset` | action | Reset the ADC state machine. |
| `digitizer_set_channel_enabled` | write | Show/hide a channel's trace in the charts. |
| `digitizer_set_continuous` | write | Start/stop the periodic capture loop (35ms). |
| `digitizer_capture_once` | action | Single-shot capture; refreshes the charts. |
| `digitizer_read_samples` | read | Latest 1024 raw signed-int samples per channel. |
| `digitizer_get_sample_rate` | read | ADC sample rate in Hz; combine with the FFT length to map spectrum bins to Hz. |
| `digitizer_get_channel_enabled` | read | Whether a channel's trace is currently displayed. |

#### Spectrum Analyzer (7 tools)

| Tool | Kind | Notes |
|------|------|-------|
| `spectrum_set_mode` / `spectrum_get_mode` | write / read | Toggle between live spectrum and rolling spectrogram. |
| `spectrum_set_noise_floor` / `spectrum_get_noise_floor` | write / read | Spectrogram noise-floor threshold (-130..-10 dBFS). |
| `spectrum_set_gamma` / `spectrum_get_gamma` | write / read | Spectrogram contrast gamma (0.25..4.0). |
| `spectrum_read_latest` | read | Latest FFT magnitudes as 512 dBFS values per channel (DC..Nyquist). |

### Lifecycle

1. The Platform launches the app's renderer.
2. The preload exposes `window.FrontPanelAPI.mcp` iff bindings were granted.
3. Once the device drivers are initialized, App.tsx calls
   `registerMcpBindings(deps)`:
   - `useWorkQueue(queue)` once — binds the same `WorkQueue` the UI
     handlers use, so MCP calls and UI clicks interleave naturally on
     the device's command queue.
   - `register(name, handler)` for each of the 21 declared tools.
   - `ready()` flushes the registrations into the live tool list as a
     single `tools/list_changed` notification to connected AI clients.
4. When an AI calls a tool, the Platform validates `args` against the
   schema and routes the call into the matching handler.

### Big-array reads

`digitizer_read_samples` returns 2048 16-bit integers (≈10 KB JSON);
`spectrum_read_latest` returns 1024 doubles (≈15 KB). That's well
within MCP wire budgets, and the audit ring buffer truncates the
*input* arguments — tool *results* aren't audit-logged at full size.
The AI computes derived measurements (peak frequency, RMS, noise
floor) from these arrays via `run_javascript`. No summary-scalar
tools are provided in v1; if wire load becomes a concern later, a
`spectrum_peak`-style follow-up can be added without breaking
existing scripts.

The handlers route through `mcp.runOnQueue(...)` so a read snapshot
is never half-written by an in-flight capture.

### Scripting parity

FFTScope opts into the scripting permission (`permissions.mcp.script:
true`), which exposes an extra `app:<runtimeId>:run_javascript(code)`
tool when the user grants **Run scripts** in MCP Settings. Inside that
script, every tool declared in `mcp.json` is reachable as
`mcp.tools.<name>(args)` — same arguments, same JSON Schema validation,
same WorkQueue.

Sweep-and-measure is the canonical FFTScope use case for scripting:
one local script execution batches dozens of tool calls (set tone,
capture, FFT, return peak) into a single MCP wire round-trip.

```js
// run_javascript({ code: <this string> })
//
// Sweep a single tone across a list of bins, capture the FFT at
// each frequency, return the peak magnitude per step.
//
// Note the `return (async function () { ... })();` wrapper and the
// object (not array) return value — see "Sandbox constraints" below.
return (async function () {
    // Bins stay <= 511; above that the real IFFT mirrors back down.
    const bins = [50, 100, 200, 400, 500];
    const measurements = [];

    // Own the capture cadence: stop the free-running loop so each
    // reading pairs with the tone this iteration just set.
    await mcp.tools.digitizer_set_continuous({ enabled: false });
    await mcp.tools.waveform_set_autoscale({ enabled: true });

    for (const bin of bins) {
        // Configure vector slot 0 to a single tone at this bin.
        await mcp.tools.waveform_set_vector({
            vector_id: 0,
            bin,
            amplitude_dbfs: -6,
            enabled: true
        });

        // Let the new tone settle, then take one deterministic capture.
        await new Promise(r => setTimeout(r, 60));
        await mcp.tools.digitizer_capture_once();

        // Read the FFT magnitudes (512 dBFS values per channel).
        const { ch2 } = await mcp.tools.spectrum_read_latest();

        // Pick the peak bin and record it.
        let peakBin = 0, peakDb = -Infinity;
        for (let i = 1; i < ch2.length; i++) {
            if (ch2[i] > peakDb) { peakDb = ch2[i]; peakBin = i; }
        }
        measurements.push({ requestedBin: bin, peakBin, peakDb });
    }

    // Quiesce the generator and restore the live display.
    await mcp.tools.waveform_reset();
    await mcp.tools.digitizer_set_continuous({ enabled: true });

    return { measurements };
})();
```

The example reads `ch2`; use whichever channel your ADC input is wired
to. An unconnected channel floats at a few LSB of noise rather than
mirroring its neighbour, so a peak search over the wrong one returns a
meaningless bin.

#### Sandbox constraints

The script runs in a per-app sandboxed renderer (`sandbox: true`,
`contextIsolation: true`, no Node, no file system, no network). The
only globals are `mcp.tools.<name>` stubs and standard JavaScript. A
wall-clock watchdog (default 30s) terminates runaway scripts.

Two Platform-side quirks shape how the code must be written:

- **Top-level `await` is rejected**, despite what the `run_javascript`
  tool description claims — you get
  `await is only valid in async functions and the top level bodies of
  modules`. The Platform wraps the source in a plain `Function`, not an
  `AsyncFunction`. It *does* await a returned promise, so wrap the body
  in `return (async function () { ... })();` as above.
- **The result must be a JSON object**, not a bare array or scalar.
  Returning an array fails schema validation with
  `expected record, received array`. Wrap it: `return { measurements };`.

#### Capture timing

`spectrum_read_latest` and `digitizer_read_samples` return whatever the
last capture left in the shared buffers; they do not trigger one. With
the continuous loop running (the default, ~35ms) a read can land on a
frame captured just before your `waveform_set_vector` took effect. For
deterministic measurement, call `digitizer_set_continuous({ enabled:
false })` first and drive each reading with an explicit
`digitizer_capture_once()`, as the example does. Re-enable it on the
way out so the UI goes back to live.

Both readers report dBFS against the ADC's full-scale, so a level
derived from `digitizer_read_samples` and the corresponding
`spectrum_read_latest` bin agree with each other.

### Why each handler routes through the WorkQueue

The FrontPanel SDK pipe is single-tasking per device. Mixing AI-driven
captures with UI-driven button clicks on the same hardware without
serialization produces interleaved-on-the-wire corruption. Every
state-mutating handler in FFTScope posts the device I/O onto the same
`WorkQueue` the UI uses. AI and human are equal first-class citizens
of the device's command queue.

### Sharing state between UI and MCP handlers

The `WorkQueue` serializes I/O to the device, but not the *app's*
state. When a piece of gateware state is mirrored into React state
(every checkbox, mode flag, slider value) **both the MCP handler and
the UI control have to update both surfaces**, or they will drift.

FFTScope follows the same pattern Counters established
(see ENG-2796): lift every MCP-exposed state slice up to `App.tsx`,
define one shared handler per state-mutating action, and have both
the UI control and the MCP tool call that one handler. The
WaveformGenerator's IFFT-bin adapter, the digitizer's capture
buffers, and the spectrum's FFT-output buffers all live at App scope
so the read tools and the views read from the same backing store.

This is the larger refactor FFTScope adds on top of Counters: more
state to lift, but the shape is identical — one handler per action,
one buffer per read.

If you're building your own FrontPanel app: start by enumerating the
controls you want exposed as MCP tools, then for each, ask "what
state mirrors what's on the gateware, and where does the UI get it
from today?" Lift that state to `App.tsx`, write one handler that
updates both the gateware and the React state, and call that handler
from both the UI control and the MCP tool. That's the whole pattern.
