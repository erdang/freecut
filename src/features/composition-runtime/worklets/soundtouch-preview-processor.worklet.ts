import { SimpleFilter, SoundTouch } from 'soundtouchjs';
import {
  SOUND_TOUCH_PREVIEW_PROCESSOR_NAME,
  type SoundTouchPreviewProcessorMessage,
} from '../utils/soundtouch-preview-shared';

class StereoBufferSource {
  private leftChannel = new Float32Array(0);
  private rightChannel = new Float32Array(0);
  frameCount = 0;

  load(leftChannel: Float32Array, rightChannel: Float32Array, frameCount: number): void {
    this.leftChannel = leftChannel;
    this.rightChannel = rightChannel;
    this.frameCount = Math.max(0, Math.min(frameCount, leftChannel.length, rightChannel.length));
  }

  extract(target: Float32Array, numFrames: number, sourcePosition: number = 0): number {
    const safeSourcePosition = Math.max(0, Math.floor(sourcePosition));
    const availableFrames = Math.max(0, this.frameCount - safeSourcePosition);
    const framesToCopy = Math.min(numFrames, availableFrames);

    let outIndex = 0;
    for (let i = 0; i < framesToCopy; i++) {
      const sourceIndex = safeSourcePosition + i;
      target[outIndex++] = this.leftChannel[sourceIndex] ?? 0;
      target[outIndex++] = this.rightChannel[sourceIndex] ?? 0;
    }

    return framesToCopy;
  }
}

class SoundTouchPreviewProcessor extends AudioWorkletProcessor {
  private readonly source = new StereoBufferSource();
  private readonly soundTouch = new SoundTouch();
  private readonly filter = new SimpleFilter(this.source as {
    extract: (target: Float32Array, numFrames: number, sourcePosition?: number) => number;
  }, this.soundTouch);
  private scratch = new Float32Array(256);
  private playing = false;

  constructor() {
    super();
    this.soundTouch.tempo = 1;
    this.soundTouch.pitch = 1;
    this.soundTouch.rate = 1;
    this.port.onmessage = (event: MessageEvent<SoundTouchPreviewProcessorMessage>) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(message: SoundTouchPreviewProcessorMessage): void {
    switch (message.type) {
      case 'load-source': {
        const leftChannel = new Float32Array(message.leftChannel);
        const rightChannel = new Float32Array(message.rightChannel);
        this.source.load(leftChannel, rightChannel, message.frameCount);
        this.filter.sourcePosition = 0;
        break;
      }
      case 'seek':
        this.filter.sourcePosition = Math.max(0, Math.floor(message.frame));
        break;
      case 'set-tempo':
        this.soundTouch.tempo = Math.max(0.01, message.tempo);
        this.soundTouch.pitch = 1;
        this.soundTouch.rate = 1;
        break;
      case 'set-playing':
        this.playing = message.playing;
        break;
      case 'reset':
        this.filter.sourcePosition = 0;
        this.playing = false;
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const leftOutput = output[0];
    const rightOutput = output[1] ?? output[0];
    leftOutput.fill(0);
    rightOutput.fill(0);

    if (!this.playing || this.source.frameCount === 0) {
      return true;
    }

    const requiredSamples = leftOutput.length * 2;
    if (this.scratch.length < requiredSamples) {
      this.scratch = new Float32Array(requiredSamples);
    }

    const framesExtracted = this.filter.extract(this.scratch, leftOutput.length);
    for (let i = 0; i < framesExtracted; i++) {
      leftOutput[i] = this.scratch[i * 2] ?? 0;
      rightOutput[i] = this.scratch[i * 2 + 1] ?? 0;
    }

    return true;
  }
}

registerProcessor(SOUND_TOUCH_PREVIEW_PROCESSOR_NAME, SoundTouchPreviewProcessor);
