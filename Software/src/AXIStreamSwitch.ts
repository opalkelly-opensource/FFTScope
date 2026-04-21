import { IFPGADataPortAXI } from "@opalkelly/frontpanel-platform-api";

export class AXIStreamSwitch {
    private readonly _FPGADataPort: IFPGADataPortAXI;

    private readonly _TimeoutMilliseconds = 5000;

    private readonly _ControlRegisterAddress: number;
    private readonly _MUXRegisterAddress: number;

    constructor(fpgaDataPort: IFPGADataPortAXI, baseAddress: number | bigint) {
        this._FPGADataPort = fpgaDataPort;

        const base = typeof baseAddress === "bigint" ? Number(baseAddress) : baseAddress;
        this._ControlRegisterAddress = base + 0x00;
        this._MUXRegisterAddress = base + 0x40;
    }

    public async UpdateSlaveIndex(index: number) {
        // Write slave index to MUX Selector
        await this._FPGADataPort.axiLite.write(
            this._MUXRegisterAddress,
            index,
            this._TimeoutMilliseconds
        );

        // Commit Configuration
        await this._FPGADataPort.axiLite.write(
            this._ControlRegisterAddress,
            0x02,
            this._TimeoutMilliseconds
        );
    }
}
