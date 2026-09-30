const audioFile = document.getElementById("audioFile");
const messageInput = document.getElementById("message");
const resultMessage = document.getElementById("resultMessage");

const encodeBtn = document.getElementById("encodeBtn");
const decodeBtn = document.getElementById("decodeBtn");
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");

const fileInfo = document.getElementById("fileInfo");
const status = document.getElementById("status");

const progress = document.getElementById("progress");
const progressText = document.getElementById("progressText");

const charCount = document.getElementById("charCount");

let selectedFile = null;
let outputBlob = null;
let downloadUrl = null;

audioFile.addEventListener("change", function () {
    if (audioFile.files.length === 0) {
        selectedFile = null;
        fileInfo.textContent = "Belum ada file yang dipilih";
        return;
    }

    selectedFile = audioFile.files[0];

    if (!selectedFile.name.toLowerCase().endsWith(".wav")) {
        selectedFile = null;
        fileInfo.textContent = "File tidak valid";

        showStatus(
            "Gunakan file audio WAV",
            "error"
        );

        return;
    }

    const sizeMB = selectedFile.size / (1024 * 1024);

    fileInfo.textContent =
        selectedFile.name +
        " (" +
        sizeMB.toFixed(2) +
        " MB)";

    showStatus(
        "File audio berhasil dipilih",
        "success"
    );
});

messageInput.addEventListener("input", function () {
    charCount.textContent = messageInput.value.length;
});

encodeBtn.addEventListener("click", encodeAudio);
decodeBtn.addEventListener("click", decodeAudio);
resetBtn.addEventListener("click", resetApp);
downloadBtn.addEventListener("click", downloadFile);

function showStatus(text, type = "normal") {
    status.textContent = "Status: " + text;

    if (type === "success") {
        status.style.color = "#00ff99";
    } else if (type === "error") {
        status.style.color = "#ff6b6b";
    } else {
        status.style.color = "white";
    }
}

function setProgress(value) {
    const percentage = Math.max(0, Math.min(100, value));

    progress.style.width = percentage + "%";
    progressText.textContent = Math.round(percentage) + "%";
}

function delay() {
    return new Promise(resolve => {
        requestAnimationFrame(resolve);
    });
}

function readString(dataView, offset, length) {
    let result = "";

    for (let i = 0; i < length; i++) {
        result += String.fromCharCode(
            dataView.getUint8(offset + i)
        );
    }

    return result;
}

function findChunk(dataView, chunkName, startOffset) {
    let offset = startOffset;

    while (offset + 8 <= dataView.byteLength) {
        const name = readString(dataView, offset, 4);
        const size = dataView.getUint32(
            offset + 4,
            true
        );

        if (name === chunkName) {
            return {
                offset: offset,
                dataOffset: offset + 8,
                size: size
            };
        }

        offset += 8 + size;

        if (size % 2 !== 0) {
            offset++;
        }
    }

    return null;
}

function parseWav(buffer) {
    const dataView = new DataView(buffer);

    if (dataView.byteLength < 12) {
        throw new Error("File WAV tidak valid");
    }

    const riff = readString(dataView, 0, 4);
    const wave = readString(dataView, 8, 4);

    if (riff !== "RIFF" || wave !== "WAVE") {
        throw new Error("File bukan WAV yang valid");
    }

    const fmtChunk = findChunk(
        dataView,
        "fmt ",
        12
    );

    const dataChunk = findChunk(
        dataView,
        "data",
        12
    );

    if (!fmtChunk) {
        throw new Error("Chunk fmt tidak ditemukan");
    }

    if (!dataChunk) {
        throw new Error("Chunk data tidak ditemukan");
    }

    const audioFormat = dataView.getUint16(
        fmtChunk.dataOffset,
        true
    );

    const channels = dataView.getUint16(
        fmtChunk.dataOffset + 2,
        true
    );

    const sampleRate = dataView.getUint32(
        fmtChunk.dataOffset + 4,
        true
    );

    const bitsPerSample = dataView.getUint16(
        fmtChunk.dataOffset + 14,
        true
    );

    if (audioFormat !== 1) {
        throw new Error(
            "Gunakan WAV PCM tanpa kompresi"
        );
    }

    if (bitsPerSample !== 8 && bitsPerSample !== 16) {
        throw new Error(
            "Untuk aplikasi ini gunakan WAV 8-bit atau 16-bit PCM"
        );
    }

    return {
        dataView: dataView,
        fmtChunk: fmtChunk,
        dataChunk: dataChunk,
        channels: channels,
        sampleRate: sampleRate,
        bitsPerSample: bitsPerSample
    };
}

function numberToBits(number) {
    const bits = [];

    for (let i = 31; i >= 0; i--) {
        bits.push(
            (number >>> i) & 1
        );
    }

    return bits;
}

function bytesToBits(bytes) {
    const bits = [];

    for (let i = 0; i < bytes.length; i++) {
        for (let bit = 7; bit >= 0; bit--) {
            bits.push(
                (bytes[i] >> bit) & 1
            );
        }
    }

    return bits;
}

function bitsToBytes(bits) {
    const bytes = new Uint8Array(
        Math.floor(bits.length / 8)
    );

    for (let i = 0; i < bytes.length; i++) {
        let value = 0;

        for (let bit = 0; bit < 8; bit++) {
            value =
                (value << 1) |
                bits[i * 8 + bit];
        }

        bytes[i] = value;
    }

    return bytes;
}

async function encodeAudio() {
    try {
        if (!selectedFile) {
            showStatus(
                "Pilih file WAV terlebih dahulu",
                "error"
            );
            return;
        }

        const message = messageInput.value;

        if (message.length === 0) {
            showStatus(
                "Pesan rahasia tidak boleh kosong",
                "error"
            );
            return;
        }

        encodeBtn.disabled = true;
        decodeBtn.disabled = true;
        downloadBtn.disabled = true;

        setProgress(0);

        showStatus(
            "Membaca file audio..."
        );

        const buffer =
            await selectedFile.arrayBuffer();

        const wav = parseWav(buffer);

        const encoder =
            new TextEncoder();

        const messageBytes =
            encoder.encode(message);

        const dataLength =
            wav.dataChunk.size;

        const capacity =
            Math.floor(
                (dataLength - 32) / 8
            );

        if (messageBytes.length > capacity) {
            throw new Error(
                "Pesan terlalu panjang. Kapasitas maksimal sekitar " +
                capacity +
                " byte."
            );
        }

        const messageLengthBits =
            numberToBits(messageBytes.length);

        const messageBits =
            bytesToBits(messageBytes);

        const allBits =
            messageLengthBits.concat(
                messageBits
            );

        const outputBuffer =
            buffer.slice(0);

        const outputView =
            new DataView(outputBuffer);

        const dataStart =
            wav.dataChunk.dataOffset;

        for (let i = 0; i < allBits.length; i++) {
            const original =
                outputView.getUint8(
                    dataStart + i
                );

            const newValue =
                (original & 254) |
                allBits[i];

            outputView.setUint8(
                dataStart + i,
                newValue
            );

            if (i % 1000 === 0) {
                const percent =
                    (i / allBits.length) * 100;

                setProgress(percent);

                await delay();
            }
        }

        setProgress(100);

        outputBlob =
            new Blob(
                [outputBuffer],
                {
                    type: "audio/wav"
                }
            );

        if (downloadUrl) {
            URL.revokeObjectURL(
                downloadUrl
            );
        }

        downloadUrl =
            URL.createObjectURL(
                outputBlob
            );

        downloadBtn.disabled = false;

        showStatus(
            "Pesan berhasil disisipkan",
            "success"
        );

    } catch (error) {
        showStatus(
            error.message,
            "error"
        );
    } finally {
        encodeBtn.disabled = false;
        decodeBtn.disabled = false;
    }
}

async function decodeAudio() {
    try {
        if (!selectedFile) {
            showStatus(
                "Pilih file WAV terlebih dahulu",
                "error"
            );
            return;
        }

        encodeBtn.disabled = true;
        decodeBtn.disabled = true;

        resultMessage.value = "";

        setProgress(0);

        showStatus(
            "Membaca pesan dari audio..."
        );

        const buffer =
            await selectedFile.arrayBuffer();

        const wav =
            parseWav(buffer);

        const dataStart =
            wav.dataChunk.dataOffset;

        const dataLength =
            wav.dataChunk.size;

        if (dataLength < 32) {
            throw new Error(
                "Data audio terlalu kecil"
            );
        }

        const lengthBits = [];

        for (let i = 0; i < 32; i++) {
            const value =
                wav.dataView.getUint8(
                    dataStart + i
                ) & 1;

            lengthBits.push(value);

            if (i % 4 === 0) {
                setProgress(
                    (i / 32) * 20
                );

                await delay();
            }
        }

        let messageLength = 0;

        for (let i = 0; i < 32; i++) {
            messageLength =
                (messageLength * 2) +
                lengthBits[i];
        }

        const maxCapacity =
            Math.floor(
                (dataLength - 32) / 8
            );

        if (
            messageLength <= 0 ||
            messageLength > maxCapacity
        ) {
            throw new Error(
                "Tidak ditemukan pesan steganografi yang valid"
            );
        }

        const totalBits =
            messageLength * 8;

        const messageBits = [];

        for (
            let i = 0;
            i < totalBits;
            i++
        ) {
            const value =
                wav.dataView.getUint8(
                    dataStart + 32 + i
                ) & 1;

            messageBits.push(value);

            if (i % 1000 === 0) {
                const percent =
                    20 +
                    (i / totalBits) * 80;

                setProgress(percent);

                await delay();
            }
        }

        const messageBytes =
            bitsToBytes(messageBits);

        const decoder =
            new TextDecoder();

        const message =
            decoder.decode(
                messageBytes
            );

        resultMessage.value =
            message;

        setProgress(100);

        showStatus(
            "Pesan berhasil diambil",
            "success"
        );

    } catch (error) {
        showStatus(
            error.message,
            "error"
        );
    } finally {
        encodeBtn.disabled = false;
        decodeBtn.disabled = false;
    }
}

function downloadFile() {
    if (!outputBlob || !downloadUrl) {
        return;
    }

    const link =
        document.createElement("a");

    link.href = downloadUrl;
    link.download =
        "steganografi_output.wav";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
}

function resetApp() {
    selectedFile = null;
    outputBlob = null;

    if (downloadUrl) {
        URL.revokeObjectURL(
            downloadUrl
        );

        downloadUrl = null;
    }

    audioFile.value = "";
    messageInput.value = "";
    resultMessage.value = "";

    charCount.textContent = "0";

    fileInfo.textContent =
        "Belum ada file yang dipilih";

    setProgress(0);

    downloadBtn.disabled = true;

    showStatus(
        "Menunggu"
    );
}