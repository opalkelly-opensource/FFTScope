import { ByteCount } from "@opalkelly/frontpanel-platform-api";

export class AXIRegister {
    private readonly _Address: number;

    private readonly _Buffer: ArrayBuffer;
    private readonly _Data: DataView;

    public get Address() {
        return this._Address;
    }

    public get Buffer() {
        return this._Buffer;
    }

    public get Data() {
        return this._Data;
    }

    constructor(address: number | bigint, width: ByteCount) {
        this._Address = typeof address === "bigint" ? Number(address) : address;

        this._Buffer = new ArrayBuffer(width);
        this._Data = new DataView(this._Buffer, 0, width);
    }
}
