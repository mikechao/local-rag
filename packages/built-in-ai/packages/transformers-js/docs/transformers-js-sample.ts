import { pipeline } from '@huggingface/transformers';

const tts = await pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-ONNX');

const input_text = 'This is really cool!';
const audio = await tts(input_text, {
    speaker_embeddings: 'https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/F1.bin',
    num_inference_steps: 5, // Higher = better quality (typically 1-50)
    speed: 1.05, // Higher = faster speech (typically 0.8-1.2)
});
await audio.save('output.wav'); // or `audio.toBlob()`;
