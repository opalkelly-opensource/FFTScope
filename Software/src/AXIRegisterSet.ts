import { ByteCount } from "@opalkelly/frontpanel-platform-api";

export class AXIRegisterSet {
    private readonly _BaseAddress: number;
    private readonly _RegisterCount: number;
    private readonly _RegisterWidth: number;

    private readonly _Buffer: ArrayBuffer;
    private readonly _Data: DataView;
    private readonly _Uint32View: Uint32Array;

    public get BaseAddress() {
        return this._BaseAddress;
    }

    public get RegisterCount() {
        return this._RegisterCount;
    }

    public get RegisterWidth() {
        return this._RegisterWidth;
    }

    public get Buffer() {
        return this._Buffer;
    }

    public get Uint32View() {
        return this._Uint32View;
    }

    constructor(baseAddress: number | bigint, registerCount: number, registerWidth: ByteCount) {
        this._BaseAddress = typeof baseAddress === "bigint" ? Number(baseAddress) : baseAddress;
        this._RegisterCount = registerCount;
        this._RegisterWidth = registerWidth;

        this._Buffer = new ArrayBuffer(this._RegisterWidth * this._RegisterCount);
        this._Data = new DataView(this._Buffer);
        this._Uint32View = new Uint32Array(this._Buffer);
    }

    public setUint32Register(index: number, value: number) {
        this._Data.setUint32(this._RegisterWidth * index, value, true);
    }

    public getUint32Register(index: number) : number {
        return this._Data.getUint32(this._RegisterWidth * index, true);
    }
}
