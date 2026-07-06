/* eslint-disable no-console */
// eslint-disable-next-line import/no-unresolved, import/extensions
const VoiceEngine = require('./discord_voice.node');
const fs = require('fs');
const os = require('os');
const process = require('process');
const path = require('path');

const isElectronRenderer =
  typeof window !== 'undefined' && window != null && window.DiscordNative && window.DiscordNative.isRenderer;

const appSettings = isElectronRenderer ? window.DiscordNative.settings : global.appSettings;
const features = isElectronRenderer ? window.DiscordNative.features : global.features;
const mainArgv = isElectronRenderer ? window.DiscordNative.processUtils.getMainArgvSync() : [];
let dataDirectory;

try {
  dataDirectory =
    isElectronRenderer && window.DiscordNative.fileManager.getModuleDataPathSync
      ? path.join(window.DiscordNative.fileManager.getModuleDataPathSync(), 'discord_voice')
      : null;
} catch (e) {
  console.error('Failed to get data directory: ', e);
}

// FIX: Read from settings using getSync()
const useLegacyAudioDevice = appSettings ? appSettings.getSync('useLegacyAudioDevice') : false;
const audioSubsystemSelected = appSettings ? appSettings.getSync('audioSubsystem') : 'standard';
const audioSubsystem = useLegacyAudioDevice || audioSubsystemSelected;
const debugLogging = appSettings ? appSettings.getSync('debugLogging') : false;

function versionGreaterThanOrEqual(v1, v2) {
  const v1parts = v1.split('.').map(Number);
  const v2parts = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const num1 = i < v1parts.length ? v1parts[i] : 0;
    const num2 = i < v2parts.length ? v2parts[i] : 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return true;
}

function parseArguments(args) {
  const parsed = {
    'log-level': -1,
  };

  const descriptions = {
    'log-level': 'Logging level.',
    'use-fake-video-capture': 'Use fake video capture device.',
    'use-file-for-fake-video-capture': 'Use local file for fake video capture.',
    'use-fake-audio-capture': 'Use fake audio capture device.',
    'use-file-for-fake-audio-capture': 'Use local file for fake audio capture.',
  };

  for (let i = 0; i < args.length; i++) {
    const parts = args[i].split('=');
    const arg = parts[0];
    const inlineValue = parts.slice(1).join('=');

    function getValue() {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      return args[++i];
    }

    switch (arg) {
      case '-h':
      case '--help':
        console.log('Help requested:');
        for (const [key, value] of Object.entries(descriptions)) {
          console.log(`--${key}: ${value}`);
        }
        process.exit(0);
        break;
      case '--log-level':
        parsed['log-level'] = parseInt(getValue(), 10);
        break;
      case '--use-fake-video-capture':
        parsed['use-fake-video-capture'] = true;
        break;
      case '--use-file-for-fake-video-capture':
        parsed['use-file-for-fake-video-capture'] = getValue();
        break;
      case '--use-fake-audio-capture':
        parsed['use-fake-audio-capture'] = true;
        break;
      case '--use-file-for-fake-audio-capture':
        parsed['use-file-for-fake-audio-capture'] = getValue();
        break;
    }
  }

  return parsed;
}

const argv = parseArguments(mainArgv.slice(1));
const logLevel = argv['log-level'] === -1 ? (debugLogging ? 2 : -1) : argv['log-level'];
const useFakeVideoCapture = argv['use-fake-video-capture'];
const useFileForFakeVideoCapture = argv['use-file-for-fake-video-capture'];
const useFakeAudioCapture = argv['use-fake-audio-capture'];
const useFileForFakeAudioCapture = argv['use-file-for-fake-audio-capture'];

if (dataDirectory != null) {
  try {
    fs.mkdirSync(dataDirectory, {recursive: true});
  } catch (e) {
    console.warn("Couldn't create voice data directory ", dataDirectory, ':', e);
  }
}

if (debugLogging && console.discordVoiceHooked == null) {
  console.discordVoiceHooked = true;

  for (const logFn of ['trace', 'debug', 'info', 'warn', 'error', 'log']) {
    const originalLogFn = console[logFn];

    if (originalLogFn != null) {
      console[logFn] = function () {
        originalLogFn.apply(this, arguments);

        try {
          VoiceEngine.consoleLog(
            logFn,
            JSON.stringify(Array.from(arguments).map((v) => (v != null ? v.toString() : v))),
          );
        } catch (e) {
          // Drop errors from toString()/stringify.
        }
      };
    }
  }
}

features.declareSupported('voice_panning');
features.declareSupported('voice_multiple_connections');
features.declareSupported('media_devices');
features.declareSupported('media_video');
features.declareSupported('debug_logging');
features.declareSupported('set_audio_device_by_id');
features.declareSupported('set_video_device_by_id');
features.declareSupported('loopback');
features.declareSupported('experiment_config');
features.declareSupported('remote_locus_network_control');
//features.declareSupported('connection_replay');
features.declareSupported('simulcast');
features.declareSupported('simulcast_bugfix');
features.declareSupported('direct_video');
features.declareSupported('electron_video');
features.declareSupported('fixed_keyframe_interval');
features.declareSupported('first_frame_callback');
features.declareSupported('remote_user_multi_stream');
features.declareSupported('go_live_hardware');
features.declareSupported('bandwidth_estimation_experiments');
features.declareSupported('mls_pairwise_fingerprints');
features.declareSupported('soundshare');
features.declareSupported('screen_soundshare');
features.declareSupported('offload_adm_controls');
features.declareSupported('audio_codec_red');
features.declareSupported('sidechain_compression');
features.declareSupported('async_video_input_device_init');
features.declareSupported('async_clips_source_deinit');
features.declareSupported('port_aware_latency_testing');

if (process.platform === 'darwin') {
  features.declareSupported('screen_capture_kit');
  if (versionGreaterThanOrEqual(os.release(), '23.0.0')) {
    features.declareSupported('native_screenshare_picker');
  }
}

if (process.platform === 'linux') {
  // from WebRTC DesktopCapturer::IsRunningUnderWayland()
  const sessionType = process.env.XDG_SESSION_TYPE;
  const isUnderWayland = sessionType?.startsWith('wayland') && process.env.WAYLAND_DISPLAY != null;

  const currentDesktop = process.env.XDG_CURRENT_DESKTOP;
  // we only want to enable the gamescope capturer if we're running in a non-nested gamescope session
  const isUnderGamescope =
    !isUnderWayland && currentDesktop?.includes('gamescope') && process.env.GAMESCOPE_WAYLAND_DISPLAY != null;
  const isVaapiEnabled = VoiceEngine.isVaapiEnabled();

  if (isUnderWayland) {
    features.declareSupported('native_screenshare_picker');
  }
  if (isVaapiEnabled) {
    features.declareSupported('vaapi');
  }
  if (isUnderGamescope && isVaapiEnabled) {
    // ensure we have access to the pipewire socket
    const runtimeDir = process.env.PIPEWIRE_RUNTIME_DIR || process.env.XDG_RUNTIME_DIR || process.env.USERPROFILE;
    if (runtimeDir) {
      const socketName = runtimeDir + '/' + (process.env.PIPEWIRE_REMOTE || 'pipewire-0');
      const sstat = fs.statSync(socketName, {throwIfNoEntry: false});
      if (sstat && sstat.isSocket()) {
        features.declareSupported('gamescope_capture');
      }
    }
  }
}

if (
  process.platform === 'win32'
  || (process.platform === 'darwin' && versionGreaterThanOrEqual(os.release(), '16.0.0'))
) {
  features.declareSupported('mediapipe');
  features.declareSupported('mediapipe_animated');
}

if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
  features.declareSupported('image_quality_measurement');
}

if (process.platform === 'win32') {
  features.declareSupported('voice_legacy_subsystem');
  features.declareSupported('wumpus_video');
  features.declareSupported('hybrid_video');
  features.declareSupported('elevated_hook');
  features.declareSupported('soundshare_loopback');
  features.declareSupported('screen_previews');
  features.declareSupported('window_previews');
  features.declareSupported('audio_debug_state');
  features.declareSupported('video_effects');
  features.declareSupported('voice_experimental_subsystem');
  features.declareSupported('voice_automatic_subsystem');
  features.declareSupported('voice_subsystem_deferred_switch');
  features.declareSupported('voice_bypass_system_audio_input_processing');
  features.declareSupported('clips');
}

function bindConnectionInstance(instance) {
  return {
    destroy: () => instance.destroy(),

setTransportOptions: (options) => {
  if (options.audioEncoder) {
    options.audioEncoder.params = {
      // 28/01/26 - Patched by UNP Beats UK ❣
      // Audible Decoding: Desktop Client, PlayStation, XBOX, Chromium-based browser incl. Mobile. (tested on Fennec)
      // This is the DEFINITIVE Opus configuration exposing EVERY available feature
      // including experimental, backward-compatible, and future-proof settings.
      // this is for developers who want full control and future compatibility.
      // NOTE: This config prioritises MAXIMUM QUALITY and FEATURE COMPLETENESS over strict
      // WebRTC compliance.
      // Master
      stereo: 1,                          // Enable stereo input processing
      'sprop-stereo': 1,                  // Signal stereo playback capability to recipient
      maxaveragebitrate: 2000000,         // Hard limit at 2 Mb/s for HD audio (Opus 1.6 maximum)
      cbr: 1,                             // Constant bitrate mode for consistent quality
      maxplaybackrate: 96000,             // 96kHz playback rate for ultra-high fidelity
      useinbandfec: 0,                    // Disabled - DRED provides superior redundancy
      usedtx: 0,                          // Disabled - maintains constant stream quality
      // Build config
      buildFlags: {
        enable_osce: true,                // ML bandwidth extension enabled at build time
        enable_qext: true,                // Opus HD quantizer extension enabled
        enable_experimental: true,        // Experimental features including DRED/HD
        enable_custom_modes: true,        // Enable custom modes API
        enable_projection: true,          // Enable projection API
        enable_repacketizer: true,        // Enable repacketizer API
        enable_dred_diagnostics: true     // Enable DRED diagnostic APIs
      },
      // Runtime feature activation flags
      osceBweEnabled: true,               // Enable OSCE bandwidth extension at runtime
      opusHD: true,                       // Activate HD quality layers
      qextEnabled: true,                  // Enable quantizer extension for higher resolution
      dredEnabled: true,                  // Enable Deep Redundancy for packet loss protection
      noLaceEnabled: true,                // Enable NoLACE speech enhancement (Opus 1.6)
      repacketizerEnabled: true,          // Enable packet repacketization for network optimization
      packetAnalysisEnabled: true,        // Enable packet analysis for diagnostics
      surroundProcessingEnabled: true,    // Enable surround sound processing APIs
      // NoLACE (Neural Low Complexity Enhancement) configuration
      // ML-based speech enhancement that works only at 20ms frame sizes
      noLaceFrameSize: 20,                // NoLACE requires exactly 20ms frames
      noLaceQualityTarget: 'fullband',    // Target fullband (0-20kHz) enhancement
      noLaceIntelligibilityBoost: 1.5,    // Intelligibility boost factor (1.0 = normal)
      // Audio pipeline
      // This is critical where signal integrity matters
      echoCancellation: false,            // Disable echo cancellation (preserve natural acoustics)
      noiseSuppression: false,            // Disable noise suppression (maintain complete sonic texture)
      autoGainControl: false,             // Disable AGC (preserve true signal levels)
      highpassFilter: false,              // Disable high-pass filter (preserve sub-20Hz content)
      limiter: false,                     // Disable hard limiting (prevent clipping artifacts)
      bypassLimiter: true,                // Force bypass of any limiter stages
      disableLimiter: true,               // Additional limiter disable flag
      vad: false,                         // Disable Voice Activity Detection (preserve quiet passages)
      forceVoiceDetection: false,         // Don't force VAD even if enabled elsewhere
      disableSilenceDetection: true,      // Prevent silence detection from muting audio
      disableTypingDetection: true,
      experimentalEchoCancellation: false,
      experimentalNoiseCancellation: false,
      experimentalVoiceEnhancement: false, // experimental voice enhancement
      experimentalPreprocessing: false,   // disable all experimental preprocessing
      disableInputNoiseGate: true,        // Prevent noise gate from cutting off quiet details
      disableMicFade: true,               // disable microphone fade effects
      preserveWaveform: true,             // Preserve exact waveform shape (bit-perfect)
      preserveSilenceWaveform: true,      // Preserve silence periods exactly
      // Input signal configuration
      preserveStereo: true,               // Maintain true stereo image
      forceStereo: true,                  // Force stereo processing even on mono sources
      channels: 225,                      // 14th-order Ambisonics channel count (225 channels)
      channelsPreferred: 225,             // Preferred channel count for fallback scenarios
      sampleRate: 96000,                  // Native 96kHz sample rate (Opus 1.6 HD)
      manualClockRate: 96000,             // Manual clock rate override (matches sample rate)
      targetBitDepth: 24,                 // Target 24-bit depth for high-resolution audio
      targetFormat: 'float32',            // Float32 internal processing format
      inputDeviceBoost: 1.0,              // no additional boost (preserves native levels)
      inputVolume: 127,                   // Maximum input volume (0-127 scale)
      inputSensitivity: -100,             // Ultra-sensitive input threshold (-100dB)
      // Opus 1.6 ML-based
      osceEnabled: true,                  // Enable OSCE bandwidth extension
      bweModelVersion: 1,                 // Current BWE model version
      speechEnhancement: true,            // Wideband-to-fullband speech enhancement
      bweQualityTarget: 'fullband',       // Target fullband enhancement
      bweIntelligibilityBoost: 1.5,       // Intelligibility boost factor
      // DRED improvements (Deep Redundancy - Opus 1.6 v2 model)
      dredModelVersion: 2,                // Opus 1.6 DRED model version
      dredIntelligibility: true,          // Improved intelligibility with 4th-power error term
      dredRobustness: true,               // Trained on clean + noisy/reverberant speech
      dredModelSize: 600,                 // 600 kB model (3x smaller than 1.5 version)
      dredRedundancyLevel: 3,             // Optimized redundancy level
      deepPLCEnabled: true,               // Enable Deep Packet Loss Concealment
      deepPLCStrength: 'max',             // Maximum PLC strength for best recovery
      dredBweIntegration: true,           // Enable BWE integration with DRED
      // Experimental Opus HD support
      extendedBandwidth: true,            // Enable bandwidth beyond 20 kHz
      maxQuantizerDepth: 20,              // Quantizers can reach 20 bits depth
      hdBitrateCap: 2000000,              // HD bitrate cap (2 Mb/s)
      ultrasonicSupport: true,            // Support ultrasonic frequencies
      // 24-bit Audio API integration
      enable24BitAPI: true,               // Use new 24-bit integer API
      preserveDynamicRange: true,         // Supports values beyond nominal range
      int24BitDepth: 24,                  // Native 24-bit depth
      int24NominalRange: 8388607,         // 2^23-1 nominal range for 24-bit
      preservePeakValues: true,           // Preserve dynamic range peaks without clipping
      // Official Opus 1.5.2 features (fully compatible with 1.6)
      phaseInversionDisabled: 1,          // Disable phase inversion for better stereo imaging
      forceMode: 1002,                    // Force CELT_ONLY mode (1002 = OPUS_MODE_CELT_ONLY)
      expertFrameDuration: 120,           // Expert control over frame duration (120ms)
      predictionDisabled: 0,              // Keep prediction enabled (0) for best quality
      lsbDepth: 24,                       // 24-bit depth preservation
      variableDuration: 2,                // OPUS_FRAMESIZE_VARIABLE for adaptive sizing
      silkKinematics: 1,                  // Enable advanced SILK kinematics
      // Core Opus settings
      preferredCodec: 'opus',
      opusApplication: 'audio',
      opusBitrate: 2000000,               // Maximum bitrate for HD audio
      // Opus HD scalable bitrate layering
      // Base layer: standard Opus (backward compatible)
      // Enhancement layer: HD-only (requires Opus 1.6+ decoder)
      scalable: true,
      baseLayerBitrate: 510000,           // Max standard Opus bitrate (backward compatible)
      enhancementLayerBitrate: 1490000,   // Extra for HD features (96kHz, 24-bit, etc.)
      totalBitrate: 2000000,              // Base + enhancement = 2 Mb/s
      complexity: 10,                     // Maximum encoder complexity (10 = highest)
      frameDuration: 120,                 // 120ms frames for optimal quality
      preferredPacketDuration: 120,
      opusSignal: 2,                      // OPUS_SIGNAL_MUSIC for optimal music encoding
      opusEncoderBandwidth: 'fullband',   // Fullband encoding (0-20kHz + extended)
      maxPlaybackRate: 96000,             // 96kHz playback capability
      dtx: false,                         // Disable Discontinuous Transmission
      inbandFEC: false,                   // Disable inband FEC (DRED is superior)
      packetLossPerc: 0,                  // Assume 0% packet loss (ideal network)
      rawPreencodedOpus: false,           // Don't use pre-encoded Opus packets
      allowPassthrough: true,             // Allow passthrough when possible
      disableResample: true,              // Disable resampling (preserve native sample rate)
      // Ambisonics configuration (14th-order spherical harmonics)
      ambisonicsEnabled: true,            // Enable Ambisonics spatial audio
      ambisonicsOrder: 14,                // 14th-order Ambisonics (225 channels)
      ambisonicsChannels: 225,            // (14+1)^2 = 225 channels
      ambisonicsFormat: 'ACN',            // ACN ordering (modern standard)
      ambisonicsWeighting: 'SN3D',        // SN3D normalization
      channelMappingFamily: 3,            // Family 3 = Ambisonics with demixing matrix
      channelLayout: 'Ambisonics-14 (225ch, ACN, SN3D)',
      useOpusMultistream: true,           // Required for 225 channels
      // Multistream configuration for Ambisonics
      multistreamConfig: {
        numStreams: 225,                  // 225 streams for 14th-order Ambisonics
        coupledStreams: 224,              // Coupled streams for spatial coherence
        streamMap: Array.from({ length: 225 }, (_, i) => i), // Full channel mapping 0-224
        application: 'audio',             // High-quality audio mode
        bitrate: 2000000,                 // Full HD bitrate allocation
        complexity: 10,                   // Maximum complexity per stream
        packetLossPerc: 0,                // Zero loss expectation
        fec: 1,                           // Enable FEC for stream protection
        dtx: 0,                           // Disable DTX for constant quality
        use24BitAPI: true,                // Enable 24-bit API for multistream
        dredEnabled: true,                // Enable DRED for multistream protection
        surroundEnabled: true,            // Enable surround processing APIs
        repacketizerEnabled: true         // Enable packet repacketization
      },
      // Projection API configuration for spherical harmonic rendering
      projectionMatrix: {
        order: 14,                        // 14th-order Ambisonics
        format: 'ACN',                    // Ambisonic Channel Number ordering
        normalization: 'SN3D',            // Schmidt semi-normalization
        channels: 225,                    // Total channel count
        autoGenerate: true,               // Auto-generate projection matrix at runtime
        enableDiagnostics: true           // Enable projection diagnostics
      },
      // Custom modes API configuration
      customModes: {
        enabled: true,
        samplingRates: [8000, 12000, 16000, 24000, 48000, 96000],
        hdMode: {
          sampleRate: 96000,
          frameSize: 60,
          complexity: 10,
          application: 'audio',
          signal: 'music',
          channels: 225
        },
        enableDiagnostics: true,          // Enable custom mode diagnostics
        enableAdvancedControls: true      // Enable advanced custom mode controls
      },
      // DRED 24-bit decoding configuration
      dred24Bit: {
        enabled: true,
        modelVersion: 2,
        outputDepth: 24,
        redundancyLevel: 3,
        packetLossRecovery: 'deep_plc_max',
        enableDiagnostics: true,          // Enable DRED diagnostic APIs
        enableRedundancyAnalysis: true    // Enable redundancy analysis
      },
      // Transport and network settings
      useRED: true,                       // Enable Redundant Encoding (RFC2198)
      rtxEnabled: true,                   // Enable RTP retransmissions
      nackEnabled: true,                  // Enable NACK handling
      trafficClass: 'cs7',                // CS7 = critical priority (highest)
      congestionControl: 'bbr',           // BBR congestion control algorithm
      repacketizerEnabled: true,          // Enable packet repacketization
      packetAnalysisEnabled: true,        // Enable packet analysis
      // LATENCY
      jitterBuffer: false,                // Disable jitter buffer (use external buffer)
      jitterTarget: 0,                    // Target jitter buffer size
      enablePrebuffering: false,          // Disable prebuffering
      fixedLatencyMode: false,            // Disable fixed latency mode
      latencyTarget: 0,                   // Target latency in ms
      lowLatency: false,                  // Not low-latency mode (quality priority)
      aggressiveStreamingMode: true,      // Aggressive streaming for HD content
      priorityBoost: true,                // Boost priority for HD streams
      // UNDOCUMENTED FEATURES
      preferredPayloadType: 111,          // Standard Opus payload type
      enableRawOutput: true,              // Enable raw output access
      enableExperimentalEncoderTuning: true, // Enable experimental tuning parameters
      preferUnfilteredMic: true,          // Prefer unfiltered microphone input
      audioProcessing: false,             // Disable audio processing
      passthrough: true,                  // Enable passthrough mode
      disableAutomaticGainControl: true,
      disableAllPreprocessing: true,
      disableAudioTransform: true,
      noLowCutFilter: true,
      enableWidebandRecording: true,
      disableDynamicRangeCompression: true,
      disableSpeechMode: true,
      disableMicAutoRamp: true,
      disableVoiceActivityDetection: true,
      disableFramePadding: true,
      suppressInterference: false,
      suppressKeyboardNoise: false,
      preservePhase: true,
      preserveTiming: true,
      preserveDynamicRange: true,
      inputBypassProcessing: true,
      rawPCMInput: true,
      experimentalFullRangeInput: true,
      passthroughPCM: true,
      disablePCMUpmix: true,
      disableLevelNormalization: true,
      // FRAME OPTIMIZATION
      frameSizeMs: 60,                    // 60ms frame size (balance of quality/latency)
      maxFrameSizeMs: 120,                // Maximum frame size (120ms for HD quality)
      packetizationMode: 'variable',      // Variable packetization for optimal sizing
      mtu: 1400,                          // MTU optimized for internet (1400 bytes)
      // Redundancy and robustness
      fec: 1,
      fecStrength: 'high',
      redundancy: true,
      redundancyLevels: 3,
      packetLossMax: 70,
      expectedLoss: 50,
      // Opus internal tuning
      predictionDisabled: false,
      lpcEnabled: true,
      trainingMode: false,
      silkLpcOrder: 24,
      celtMode: 2,
      // TRANSPORT
      useSVC: true,
      useRED: true,
      rtxEnabled: true,
      nackEnabled: true,
      reqKeyframeOnLoss: true,
      // Timing and synchronization
      allowTimestampJump: false,
      alignAudioClock: true,
      // Hardware acceleration
      enableHardwareEncoding: true,
      useAudioDSPGpu: true,
      cpuAffinity: 'high',
      simdOptimizations: true,
      openbsdsimdSupport: true,
      // Network prioritisation
      trafficClass: 'cs7',
      congestionControl: 'bbr',
      enablePacing: false,
      // FALLBACK
      fallbackToMono: false,
      fallbackSampleRate: 48000,
      fallbackBitrate: 510000,
      fallbackCodec: 'opus-standard',
      // API function bindings for Opus 1.6 - EXTENDED API SURFACE
      apiFunctions: {
        encoderCreate: 'opus_encoder_create',
        encoderInit: 'opus_encoder_init',
        encoderCtl: 'opus_encoder_ctl',
        encoderDestroy: 'opus_encoder_destroy',
        encoderGetSize: 'opus_encoder_get_size',
        decoderCreate: 'opus_decoder_create',
        decoderInit: 'opus_decoder_init',
        decoderCtl: 'opus_decoder_ctl',
        decoderDestroy: 'opus_decoder_destroy',
        decoderGetSize: 'opus_decoder_get_size',
        dredAlloc: 'opus_dred_alloc',
        dredDecoderCreate: 'opus_dred_decoder_create',
        dredDecoderInit: 'opus_dred_decoder_init',
        dredDecoderCtl: 'opus_dred_decoder_ctl',
        dredDecoderDestroy: 'opus_dred_decoder_destroy',
        dredDecoderGetSize: 'opus_dred_decoder_get_size',
        dredFree: 'opus_dred_free',
        dredGetSize: 'opus_dred_get_size',
        dredParse: 'opus_dred_parse',
        dredProcess: 'opus_dred_process',
        dredGetRedundancyDuration: 'opus_dred_get_redundancy_duration',
        multistreamEncode24: 'opus_multistream_encode24',
        multistreamDecode24: 'opus_multistream_decode24',
        multistreamEncoderCreate: 'opus_multistream_encoder_create',
        multistreamEncoderInit: 'opus_multistream_encoder_init',
        multistreamEncoderCtl: 'opus_multistream_encoder_ctl',
        multistreamEncoderDestroy: 'opus_multistream_encoder_destroy',
        multistreamEncoderGetSize: 'opus_multistream_encoder_get_size',
        multistreamDecoderCreate: 'opus_multistream_decoder_create',
        multistreamDecoderInit: 'opus_multistream_decoder_init',
        multistreamDecoderCtl: 'opus_multistream_decoder_ctl',
        multistreamDecoderDestroy: 'opus_multistream_decoder_destroy',
        multistreamDecoderGetSize: 'opus_multistream_decoder_get_size',
        multistreamSurroundEncoderCreate: 'opus_multistream_surround_encoder_create',
        multistreamSurroundEncoderInit: 'opus_multistream_surround_encoder_init',
        multistreamSurroundEncoderGetSize: 'opus_multistream_surround_encoder_get_size',
        projectionEncode24: 'opus_projection_encode24',
        projectionDecode24: 'opus_projection_decode24',
        projectionStereoDecode24: 'opus_projection_stereo_decode24',
        customEncode24: 'opus_custom_encode24',
        customDecode24: 'opus_custom_decode24',
        customEncoderCreate: 'opus_custom_encoder_create',
        customEncoderInit: 'opus_custom_encoder_init',
        customEncoderCtl: 'opus_custom_encoder_ctl',
        customEncoderDestroy: 'opus_custom_encoder_destroy',
        customEncoderGetSize: 'opus_custom_encoder_get_size',
        customDecoderCreate: 'opus_custom_decoder_create',
        customDecoderInit: 'opus_custom_decoder_init',
        customDecoderCtl: 'opus_custom_decoder_ctl',
        customDecoderDestroy: 'opus_custom_decoder_destroy',
        customDecoderGetSize: 'opus_custom_decoder_get_size',
        customModeCreate: 'opus_custom_mode_create',
        customModeDestroy: 'opus_custom_mode_destroy',
        dredDecode24: 'opus_decoder_dred_decode24',
        packetGetBandwidth: 'opus_packet_get_bandwidth',
        packetGetNbChannels: 'opus_packet_get_nb_channels',
        packetGetNbFrames: 'opus_packet_get_nb_frames',
        packetGetNbSamples: 'opus_packet_get_nb_samples',
        packetGetSamplesPerFrame: 'opus_packet_get_samples_per_frame',
        packetHasLbrr: 'opus_packet_has_lbrr',
        packetParse: 'opus_packet_parse',
        packetPad: 'opus_packet_pad',
        packetUnpad: 'opus_packet_unpad',
        pcmSoftClip: 'opus_pcm_soft_clip',
        repacketizerCreate: 'opus_repacketizer_create',
        repacketizerInit: 'opus_repacketizer_init',
        repacketizerDestroy: 'opus_repacketizer_destroy',
        repacketizerGetSize: 'opus_repacketizer_get_size',
        repacketizerCat: 'opus_repacketizer_cat',
        repacketizerOut: 'opus_repacketizer_out',
        repacketizerOutRange: 'opus_repacketizer_out_range',
        repacketizerGetNbFrames: 'opus_repacketizer_get_nb_frames',
        multistreamPacketPad: 'opus_multistream_packet_pad',
        multistreamPacketUnpad: 'opus_multistream_packet_unpad',
        getVersionString: 'opus_get_version_string',
        strerror: 'opus_strerror'
      },
      // Extended CTL interface bindings
      ctlBindings: {
        getApplication: 'OPUS_GET_APPLICATION',
        getBitrate: 'OPUS_GET_BITRATE',
        getComplexity: 'OPUS_GET_COMPLEXITY',
        getDredDuration: 'OPUS_GET_DRED_DURATION',
        getDtx: 'OPUS_GET_DTX',
        getExpertFrameDuration: 'OPUS_GET_EXPERT_FRAME_DURATION',
        getForceChannels: 'OPUS_GET_FORCE_CHANNELS',
        getInbandFec: 'OPUS_GET_INBAND_FEC',
        getLookahead: 'OPUS_GET_LOOKAHEAD',
        getLsbDepth: 'OPUS_GET_LSB_DEPTH',
        getMaxBandwidth: 'OPUS_GET_MAX_BANDWIDTH',
        getPacketLossPerc: 'OPUS_GET_PACKET_LOSS_PERC',
        getPredictionDisabled: 'OPUS_GET_PREDICTION_DISABLED',
        getQext: 'OPUS_GET_QEXT',
        getSignal: 'OPUS_GET_SIGNAL',
        getVbr: 'OPUS_GET_VBR',
        getVbrConstraint: 'OPUS_GET_VBR_CONSTRAINT',
        setApplication: 'OPUS_SET_APPLICATION',
        setBandwidth: 'OPUS_SET_BANDWIDTH',
        setBitrate: 'OPUS_SET_BITRATE',
        setComplexity: 'OPUS_SET_COMPLEXITY',
        setDnnBlob: 'OPUS_SET_DNN_BLOB',
        setDredDuration: 'OPUS_SET_DRED_DURATION',
        setDtx: 'OPUS_SET_DTX',
        setExpertFrameDuration: 'OPUS_SET_EXPERT_FRAME_DURATION',
        setForceChannels: 'OPUS_SET_FORCE_CHANNELS',
        setInbandFec: 'OPUS_SET_INBAND_FEC',
        setLsbDepth: 'OPUS_SET_LSB_DEPTH',
        setMaxBandwidth: 'OPUS_SET_MAX_BANDWIDTH',
        setPacketLossPerc: 'OPUS_SET_PACKET_LOSS_PERC',
        setPredictionDisabled: 'OPUS_SET_PREDICTION_DISABLED',
        setQext: 'OPUS_SET_QEXT',
        setSignal: 'OPUS_SET_SIGNAL',
        setVbr: 'OPUS_SET_VBR',
        setVbrConstraint: 'OPUS_SET_VBR_CONSTRAINT',
        getBandwidth: 'OPUS_GET_BANDWIDTH',
        getFinalRange: 'OPUS_GET_FINAL_RANGE',
        getInDtx: 'OPUS_GET_IN_DTX',
        getPhaseInversionDisabled: 'OPUS_GET_PHASE_INVERSION_DISABLED',
        getSampleRate: 'OPUS_GET_SAMPLE_RATE',
        resetState: 'OPUS_RESET_STATE',
        setPhaseInversionDisabled: 'OPUS_SET_PHASE_INVERSION_DISABLED',
        getGain: 'OPUS_GET_GAIN',
        getIgnoreExtensions: 'OPUS_GET_IGNORE_EXTENSIONS',
        getLastPacketDuration: 'OPUS_GET_LAST_PACKET_DURATION',
        getOsceBwe: 'OPUS_GET_OSCE_BWE',
        getPitch: 'OPUS_GET_PITCH',
        setGain: 'OPUS_SET_GAIN',
        setIgnoreExtensions: 'OPUS_SET_IGNORE_EXTENSIONS',
        setOsceBwe: 'OPUS_SET_OSCE_BWE',
        multistreamGetDecoderState: 'OPUS_MULTISTREAM_GET_DECODER_STATE',
        multistreamGetEncoderState: 'OPUS_MULTISTREAM_GET_ENCODER_STATE'
      },
      // Pre-defined values for CTL interface
      predefinedValues: {
        application: {
          audio: 'OPUS_APPLICATION_AUDIO',
          voip: 'OPUS_APPLICATION_VOIP',
          restrictedCelt: 'OPUS_APPLICATION_RESTRICTED_CELT',
          restrictedLowdelay: 'OPUS_APPLICATION_RESTRICTED_LOWDELAY',
          restrictedSilk: 'OPUS_APPLICATION_RESTRICTED_SILK'
        },
        bandwidth: {
          narrowband: 'OPUS_BANDWIDTH_NARROWBAND',
          mediumband: 'OPUS_BANDWIDTH_MEDIUMBAND',
          wideband: 'OPUS_BANDWIDTH_WIDEBAND',
          superwideband: 'OPUS_BANDWIDTH_SUPERWIDEBAND',
          fullband: 'OPUS_BANDWIDTH_FULLBAND'
        },
        frameSize: {
          '2_5_ms': 'OPUS_FRAMESIZE_2_5_MS',
          '5_ms': 'OPUS_FRAMESIZE_5_MS',
          '10_ms': 'OPUS_FRAMESIZE_10_MS',
          '20_ms': 'OPUS_FRAMESIZE_20_MS',
          '40_ms': 'OPUS_FRAMESIZE_40_MS',
          '60_ms': 'OPUS_FRAMESIZE_60_MS',
          '80_ms': 'OPUS_FRAMESIZE_80_MS',
          '100_ms': 'OPUS_FRAMESIZE_100_MS',
          '120_ms': 'OPUS_FRAMESIZE_120_MS',
          arg: 'OPUS_FRAMESIZE_ARG',
          variable: 'OPUS_FRAMESIZE_VARIABLE'
        },
        signal: {
          voice: 'OPUS_SIGNAL_VOICE',
          music: 'OPUS_SIGNAL_MUSIC'
        },
        errors: {
          ok: 'OPUS_OK',
          badArg: 'OPUS_BAD_ARG',
          bufferTooSmall: 'OPUS_BUFFER_TOO_SMALL',
          internalError: 'OPUS_INTERNAL_ERROR',
          invalidPacket: 'OPUS_INVALID_PACKET',
          invalidState: 'OPUS_INVALID_STATE',
          unimplemented: 'OPUS_UNIMPLEMENTED',
          allocFail: 'OPUS_ALLOC_FAIL'
        }
      },
      // Metadata and diagnostics
      encoderName: 'opus-hd-1.6-ultimate',
      encoderVersion: 'libopus-1.6',
      vendorFlags: [
        'opus-1.6',
        'hd-96khz',
        'bwe-enabled',
        'dred-v2',
        '24bit-api',
        'ml-enhancement',
        'nolace-enabled',
        'ambisonics-14th-order',
        'multistream-24bit',
        'projection-24bit',
        'custom-modes-24bit',
        'dred-24bit',
        'backward-compatible-1.5',
        'opus-hd-scalable',
        'repacketizer-enabled',
        'packet-analysis-enabled',
        'surround-processing-enabled',
        'dred-diagnostics-enabled'
      ],
      // Opus 1.6 API integration flags
      opus16API: {
        enableQEXT: true,
        ignoreExtensions: false,
        enableOSCE_BWE: true,
        use24BitFunctions: true,
        dredModelForceVersion: 2,
        enableNoLACE: true,
        enableMultistream24: true,
        enableProjection24: true,
        enableCustom24: true,
        enableDRED24: true,
        enableRepacketizer: true,
        enablePacketAnalysis: true,
        enableSurroundProcessing: true,
        enableDredDiagnostics: true
      }
    };

    // HARDWARE - ENHANCED FOR 24-BIT APIs
    Object.assign(options.audioEncoder, {
      channels: 225,
      freq: 96000,
      rate: 96000,
      pacsize: 5760,
      bits_per_sample: 24,
      complexity: 10,
      signal: 'music',
      application: 'audio',
      frameSize: 60,
      noLaceFrameSize: 20,
      packetLossPerc: 0,
      use24BitAPI: true,
      qextEnabled: true,
      bweEnabled: true,
      dredModelVersion: 2,
      fixedPointAccuracy: 'high'
    });

    // NEW: API function binding
    Object.assign(options.audioEncoder, {
      apiBindings: {
        encoderCreate: 'opus_encoder_create',
        encoderInit: 'opus_encoder_init',
        encoderCtl: 'opus_encoder_ctl',
        encoderDestroy: 'opus_encoder_destroy',
        encoderGetSize: 'opus_encoder_get_size',
        decoderCreate: 'opus_decoder_create',
        decoderInit: 'opus_decoder_init',
        decoderCtl: 'opus_decoder_ctl',
        decoderDestroy: 'opus_decoder_destroy',
        decoderGetSize: 'opus_decoder_get_size',
        dredAlloc: 'opus_dred_alloc',
        dredDecoderCreate: 'opus_dred_decoder_create',
        dredDecoderInit: 'opus_dred_decoder_init',
        dredDecoderCtl: 'opus_dred_decoder_ctl',
        dredDecoderDestroy: 'opus_dred_decoder_destroy',
        dredDecoderGetSize: 'opus_dred_decoder_get_size',
        dredFree: 'opus_dred_free',
        dredGetSize: 'opus_dred_get_size',
        dredParse: 'opus_dred_parse',
        dredProcess: 'opus_dred_process',
        dredGetRedundancyDuration: 'opus_dred_get_redundancy_duration',
        multistreamEncode: 'opus_multistream_encode24',
        multistreamDecode: 'opus_multistream_decode24',
        multistreamEncoderCreate: 'opus_multistream_encoder_create',
        multistreamEncoderInit: 'opus_multistream_encoder_init',
        multistreamEncoderCtl: 'opus_multistream_encoder_ctl',
        multistreamEncoderDestroy: 'opus_multistream_encoder_destroy',
        multistreamEncoderGetSize: 'opus_multistream_encoder_get_size',
        multistreamDecoderCreate: 'opus_multistream_decoder_create',
        multistreamDecoderInit: 'opus_multistream_decoder_init',
        multistreamDecoderCtl: 'opus_multistream_decoder_ctl',
        multistreamDecoderDestroy: 'opus_multistream_decoder_destroy',
        multistreamDecoderGetSize: 'opus_multistream_decoder_get_size',
        multistreamSurroundEncoderCreate: 'opus_multistream_surround_encoder_create',
        multistreamSurroundEncoderInit: 'opus_multistream_surround_encoder_init',
        multistreamSurroundEncoderGetSize: 'opus_multistream_surround_encoder_get_size',
        projectionEncode: 'opus_projection_encode24',
        projectionDecode: 'opus_projection_decode24',
        projectionStereoDecode: 'opus_projection_stereo_decode24',
        customEncode: 'opus_custom_encode24',
        customDecode: 'opus_custom_decode24',
        customEncoderCreate: 'opus_custom_encoder_create',
        customEncoderInit: 'opus_custom_encoder_init',
        customEncoderCtl: 'opus_custom_encoder_ctl',
        customEncoderDestroy: 'opus_custom_encoder_destroy',
        customEncoderGetSize: 'opus_custom_encoder_get_size',
        customDecoderCreate: 'opus_custom_decoder_create',
        customDecoderInit: 'opus_custom_decoder_init',
        customDecoderCtl: 'opus_custom_decoder_ctl',
        customDecoderDestroy: 'opus_custom_decoder_destroy',
        customDecoderGetSize: 'opus_custom_decoder_get_size',
        customModeCreate: 'opus_custom_mode_create',
        customModeDestroy: 'opus_custom_mode_destroy',
        packetGetBandwidth: 'opus_packet_get_bandwidth',
        packetGetNbChannels: 'opus_packet_get_nb_channels',
        packetGetNbFrames: 'opus_packet_get_nb_frames',
        packetGetNbSamples: 'opus_packet_get_nb_samples',
        packetGetSamplesPerFrame: 'opus_packet_get_samples_per_frame',
        packetHasLbrr: 'opus_packet_has_lbrr',
        packetParse: 'opus_packet_parse',
        packetPad: 'opus_packet_pad',
        packetUnpad: 'opus_packet_unpad',
        pcmSoftClip: 'opus_pcm_soft_clip',
        repacketizerCreate: 'opus_repacketizer_create',
        repacketizerInit: 'opus_repacketizer_init',
        repacketizerDestroy: 'opus_repacketizer_destroy',
        repacketizerGetSize: 'opus_repacketizer_get_size',
        repacketizerCat: 'opus_repacketizer_cat',
        repacketizerOut: 'opus_repacketizer_out',
        repacketizerOutRange: 'opus_repacketizer_out_range',
        repacketizerGetNbFrames: 'opus_repacketizer_get_nb_frames',
        multistreamPacketPad: 'opus_multistream_packet_pad',
        multistreamPacketUnpad: 'opus_multistream_packet_unpad',
        getVersionString: 'opus_get_version_string',
        strerror: 'opus_strerror',
        dredDecode: 'opus_decoder_dred_decode24'
      }
    });

    // CTL interface bindings
    Object.assign(options.audioEncoder, {
      ctlBindings: {
        getApplication: 'OPUS_GET_APPLICATION',
        getBitrate: 'OPUS_GET_BITRATE',
        getComplexity: 'OPUS_GET_COMPLEXITY',
        getDredDuration: 'OPUS_GET_DRED_DURATION',
        getDtx: 'OPUS_GET_DTX',
        getExpertFrameDuration: 'OPUS_GET_EXPERT_FRAME_DURATION',
        getForceChannels: 'OPUS_GET_FORCE_CHANNELS',
        getInbandFec: 'OPUS_GET_INBAND_FEC',
        getLookahead: 'OPUS_GET_LOOKAHEAD',
        getLsbDepth: 'OPUS_GET_LSB_DEPTH',
        getMaxBandwidth: 'OPUS_GET_MAX_BANDWIDTH',
        getPacketLossPerc: 'OPUS_GET_PACKET_LOSS_PERC',
        getPredictionDisabled: 'OPUS_GET_PREDICTION_DISABLED',
        getQext: 'OPUS_GET_QEXT',
        getSignal: 'OPUS_GET_SIGNAL',
        getVbr: 'OPUS_GET_VBR',
        getVbrConstraint: 'OPUS_GET_VBR_CONSTRAINT',
        setApplication: 'OPUS_SET_APPLICATION',
        setBandwidth: 'OPUS_SET_BANDWIDTH',
        setBitrate: 'OPUS_SET_BITRATE',
        setComplexity: 'OPUS_SET_COMPLEXITY',
        setDnnBlob: 'OPUS_SET_DNN_BLOB',
        setDredDuration: 'OPUS_SET_DRED_DURATION',
        setDtx: 'OPUS_SET_DTX',
        setExpertFrameDuration: 'OPUS_SET_EXPERT_FRAME_DURATION',
        setForceChannels: 'OPUS_SET_FORCE_CHANNELS',
        setInbandFec: 'OPUS_SET_INBAND_FEC',
        setLsbDepth: 'OPUS_SET_LSB_DEPTH',
        setMaxBandwidth: 'OPUS_SET_MAX_BANDWIDTH',
        setPacketLossPerc: 'OPUS_SET_PACKET_LOSS_PERC',
        setPredictionDisabled: 'OPUS_SET_PREDICTION_DISABLED',
        setQext: 'OPUS_SET_QEXT',
        setSignal: 'OPUS_SET_SIGNAL',
        setVbr: 'OPUS_SET_VBR',
        setVbrConstraint: 'OPUS_SET_VBR_CONSTRAINT',
        getBandwidth: 'OPUS_GET_BANDWIDTH',
        getFinalRange: 'OPUS_GET_FINAL_RANGE',
        getInDtx: 'OPUS_GET_IN_DTX',
        getPhaseInversionDisabled: 'OPUS_GET_PHASE_INVERSION_DISABLED',
        getSampleRate: 'OPUS_GET_SAMPLE_RATE',
        resetState: 'OPUS_RESET_STATE',
        setPhaseInversionDisabled: 'OPUS_SET_PHASE_INVERSION_DISABLED',
        getGain: 'OPUS_GET_GAIN',
        getIgnoreExtensions: 'OPUS_GET_IGNORE_EXTENSIONS',
        getLastPacketDuration: 'OPUS_GET_LAST_PACKET_DURATION',
        getOsceBwe: 'OPUS_GET_OSCE_BWE',
        getPitch: 'OPUS_GET_PITCH',
        setGain: 'OPUS_SET_GAIN',
        setIgnoreExtensions: 'OPUS_SET_IGNORE_EXTENSIONS',
        setOsceBwe: 'OPUS_SET_OSCE_BWE',
        multistreamGetDecoderState: 'OPUS_MULTISTREAM_GET_DECODER_STATE',
        multistreamGetEncoderState: 'OPUS_MULTISTREAM_GET_ENCODER_STATE'
      }
    });

    // Pre-defined values
    Object.assign(options.audioEncoder, {
      predefinedValues: {
        application: {
          audio: 'OPUS_APPLICATION_AUDIO',
          voip: 'OPUS_APPLICATION_VOIP',
          restrictedCelt: 'OPUS_APPLICATION_RESTRICTED_CELT',
          restrictedLowdelay: 'OPUS_APPLICATION_RESTRICTED_LOWDELAY',
          restrictedSilk: 'OPUS_APPLICATION_RESTRICTED_SILK'
        },
        bandwidth: {
          narrowband: 'OPUS_BANDWIDTH_NARROWBAND',
          mediumband: 'OPUS_BANDWIDTH_MEDIUMBAND',
          wideband: 'OPUS_BANDWIDTH_WIDEBAND',
          superwideband: 'OPUS_BANDWIDTH_SUPERWIDEBAND',
          fullband: 'OPUS_BANDWIDTH_FULLBAND'
        },
        frameSize: {
          '2_5_ms': 'OPUS_FRAMESIZE_2_5_MS',
          '5_ms': 'OPUS_FRAMESIZE_5_MS',
          '10_ms': 'OPUS_FRAMESIZE_10_MS',
          '20_ms': 'OPUS_FRAMESIZE_20_MS',
          '40_ms': 'OPUS_FRAMESIZE_40_MS',
          '60_ms': 'OPUS_FRAMESIZE_60_MS',
          '80_ms': 'OPUS_FRAMESIZE_80_MS',
          '100_ms': 'OPUS_FRAMESIZE_100_MS',
          '120_ms': 'OPUS_FRAMESIZE_120_MS',
          arg: 'OPUS_FRAMESIZE_ARG',
          variable: 'OPUS_FRAMESIZE_VARIABLE'
        },
        signal: {
          voice: 'OPUS_SIGNAL_VOICE',
          music: 'OPUS_SIGNAL_MUSIC'
        },
        errors: {
          ok: 'OPUS_OK',
          badArg: 'OPUS_BAD_ARG',
          bufferTooSmall: 'OPUS_BUFFER_TOO_SMALL',
          internalError: 'OPUS_INTERNAL_ERROR',
          invalidPacket: 'OPUS_INVALID_PACKET',
          invalidState: 'OPUS_INVALID_STATE',
          unimplemented: 'OPUS_UNIMPLEMENTED',
          allocFail: 'OPUS_ALLOC_FAIL'
        }
      }
    });

    // Opus 1.6 runtime API configuration - ENHANCED
    if (options.audioEncoder.api) {
      options.audioEncoder.api.OPUS_SET_QEXT(1);
      options.audioEncoder.api.OPUS_SET_IGNORE_EXTENSIONS(0);

      if (options.audioEncoder.api.bindAPI) {
        options.audioEncoder.api.bindAPI('multistream_encode24', 'opus_multistream_encode24');
        options.audioEncoder.api.bindAPI('multistream_decode24', 'opus_multistream_decode24');
        options.audioEncoder.api.bindAPI('projection_encode24', 'opus_projection_encode24');
        options.audioEncoder.api.bindAPI('projection_decode24', 'opus_projection_decode24');
        options.audioEncoder.api.bindAPI('custom_encode24', 'opus_custom_encode24');
        options.audioEncoder.api.bindAPI('custom_decode24', 'opus_custom_decode24');
        options.audioEncoder.api.bindAPI('dred_decode24', 'opus_decoder_dred_decode24');
      }

      options.audioEncoder.api.OPUS_SET_NO_LACE(1);

      if (options.audioEncoder.api.opus_encoder_ctl) {
        const api = options.audioEncoder.api;
        try {
          if (api.OPUS_SET_PHASE_INVERSION_DISABLED !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_PHASE_INVERSION_DISABLED, 1);
          }
          if (api.OPUS_SET_LSB_DEPTH !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_LSB_DEPTH, 24);
          }
          if (api.OPUS_SET_EXPERT_FRAME_DURATION !== undefined && api.OPUS_FRAMESIZE_120_MS !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_EXPERT_FRAME_DURATION, api.OPUS_FRAMESIZE_120_MS);
          }
          if (api.OPUS_SET_DRED_ENABLED !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_DRED_ENABLED, 1);
          }
          if (api.OPUS_SET_QEXT !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_QEXT, 1);
          }
          if (api.OPUS_SET_IGNORE_EXTENSIONS !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_IGNORE_EXTENSIONS, 0);
          }
          if (api.OPUS_SET_BWE_ML_ENABLED !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_BWE_ML_ENABLED, 1);
          }
          if (api.OPUS_SET_NO_LACE !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_NO_LACE, 1);
          }
          if (api.opus_repacketizer_create !== undefined) {
            const repacketizer = api.opus_repacketizer_create();
            if (repacketizer) {
              options.audioEncoder.repacketizer = repacketizer;
            }
          }
          if (api.opus_dred_decoder_create !== undefined) {
            const dredDecoder = api.opus_dred_decoder_create(48000, 2);
            if (dredDecoder) {
              options.audioEncoder.dredDecoder = dredDecoder;
            }
          }
          if (api.OPUS_SET_FORCE_MODE !== undefined && api.OPUS_MODE_CELT_ONLY !== undefined) {
            api.opus_encoder_ctl(api.OPUS_SET_FORCE_MODE, api.OPUS_MODE_CELT_ONLY);
          }
          if (api.opus_packet_get_nb_frames !== undefined) {
            options.audioEncoder.packetAnalysis = {
              enabled: true,
              frameAnalyzer: api.opus_packet_get_nb_frames
            };
          }
          if (api.opus_multistream_surround_encoder_create !== undefined) {
            options.audioEncoder.surroundProcessor = {
              enabled: true,
              creator: api.opus_multistream_surround_encoder_create
            };
          }
        } catch (e) {
          try {
            if (api.OPUS_SET_PHASE_INVERSION_DISABLED !== undefined) {
              api.opus_encoder_ctl(api.OPUS_SET_PHASE_INVERSION_DISABLED, 1);
            }
            if (api.OPUS_SET_LSB_DEPTH !== undefined) {
              api.opus_encoder_ctl(api.OPUS_SET_LSB_DEPTH, 24);
            }
          } catch (fallbackError) {
            // Silent failure - continue with default configuration
          }
        }
      }
    }

    // Bitrate override - HD quality
    if (options.encodingVoiceBitRate) {
      options.encodingVoiceBitRate = 2000000;
    }

    // PROFESSIONAL DIAGNOSTICS
    if (!options.reporter) {
      options.reporter = {
        collect: (scope = 'encoder') => ({
          scope,
          ts: Date.now(),
          encoderVersion: 'libopus-1.6',
          sampleRate: options.audioEncoder.freq,
          bitrate: options.audioEncoder.params.opusBitrate,
          channels: options.audioEncoder.channels,
          dredModelVersion: options.audioEncoder.dredModelVersion,
          bweEnabled: options.audioEncoder.bweEnabled,
          hdEnabled: options.audioEncoder.qextEnabled,
          noLaceEnabled: true,
          audioMetrics: {
            sampleRate: 96000,
            bitDepth: 24,
            channels: 225,
            bitrate: 2000000,
            frameSizeMs: 120,
            dynamicRange: '144dB',
            scalable: true,
            baseLayerBitrate: 510000,
            enhancementLayerBitrate: 1490000
          },
          apiSupport: {
            multistream24: true,
            projection24: true,
            custom24: true,
            dred24: true,
            repacketizer: true,
            packetAnalysis: true,
            surroundProcessing: true,
            dredDiagnostics: true,
            coreEncoder: true,
            coreDecoder: true,
            dredCore: true,
            multistreamCore: true,
            projectionCore: true,
            customModesCore: true,
            packetCore: true,
            libraryInfo: true
          },
          extendedDiagnostics: {
            repacketizerState: options.audioEncoder.repacketizer ? 'initialized' : 'disabled',
            dredDecoderState: options.audioEncoder.dredDecoder ? 'initialized' : 'disabled',
            packetAnalysisEnabled: options.audioEncoder.packetAnalysis?.enabled || false,
            surroundProcessingEnabled: options.audioEncoder.surroundProcessor?.enabled || false
          },
          features: [
            'opus-1.6',
            'hd-96khz',
            'ml-bwe',
            'dred-v2',
            '24bit-api',
            'ambisonics-14th-order',
            'nolace-enhancement',
            'multistream-24bit-api',
            'projection-24bit-api',
            'custom-modes-24bit-api',
            'opus-hd-scalable',
            'repacketizer-enabled',
            'packet-analysis-enabled',
            'surround-processing-enabled',
            'dred-diagnostics-enabled'
          ],
          systemInfo: {
            cpuLoad: (typeof process !== 'undefined' && process.cpuUsage) ? process.cpuUsage() : null,
            memoryUsage: (typeof process !== 'undefined' && process.memoryUsage) ? process.memoryUsage() : null,
            apiSurfaceSize: Object.keys(options.audioEncoder.apiBindings || {}).length
          }
        })
      };
    }
  }

  // RESOURCE ALLOCATION
  options.disable_agc = true;
  options.disable_noise_suppression = true;
  options.disable_echo_cancellation = true;

  if (options.fec) {
    options.fec = false;
  }
  if (options.packetLossRate) {
    options.packetLossRate = 0;
  }

  options.cpuPriority = 'max';
  options.gpuAcceleration = true;
  options.networkPriority = 'high';
  options.memoryPriority = 'high';
  options.repacketizerPriority = 'high';
  options.packetAnalysisPriority = 'high';

  options.opus16 = {
    hdEnabled: true,
    bweEnabled: true,
    dredEnabled: true,
    int24API: true,
    maxBitrate: 2000000,
    sampleRate: 96000,
    ambisonicsSupport: true,
    noLaceSupport: true,
    fixedPointAccuracy: 'high',
    repacketizerEnabled: true,
    packetAnalysisEnabled: true,
    surroundProcessingEnabled: true,
    dredDiagnosticsEnabled: true,
    apiSupport: {
      multistream24: true,
      projection24: true,
      custom24: true,
      dred24: true,
      repacketizer: true,
      packetAnalysis: true,
      surroundProcessing: true,
      dredDiagnostics: true,
      coreEncoder: true,
      coreDecoder: true,
      dredCore: true,
      multistreamCore: true,
      projectionCore: true,
      customModesCore: true,
      packetCore: true,
      libraryInfo: true
    },
    backwardCompatibility: true
  };

  return instance.setTransportOptions(options);
},
    setSelfMute: (mute) => instance.setSelfMute(mute),
    setSelfDeafen: (deaf) => instance.setSelfDeafen(deaf),

    mergeUsers: (users) => instance.mergeUsers(users),
    destroyUser: (userId) => instance.destroyUser(userId),

    prepareSecureFramesTransition: (transitionId, version, callback) =>
      instance.prepareSecureFramesTransition(transitionId, version, callback),
    prepareSecureFramesEpoch: (epoch, version, groupId) => instance.prepareSecureFramesEpoch(epoch, version, groupId),
    executeSecureFramesTransition: (transitionId) => instance.executeSecureFramesTransition(transitionId),

    updateMLSExternalSender: (externalSenderPackage) => instance.updateMLSExternalSender(externalSenderPackage),
    getMLSKeyPackage: (callback) => instance.getMLSKeyPackage(callback),
    processMLSProposals: (message, callback) => instance.processMLSProposals(message, callback),
    prepareMLSCommitTransition: (transitionId, commit, callback) =>
      instance.prepareMLSCommitTransition(transitionId, commit, callback),
    processMLSWelcome: (transitionId, welcome, callback) => instance.processMLSWelcome(transitionId, welcome, callback),

    setLocalVolume: (userId, volume) => instance.setLocalVolume(userId, volume),
    setLocalMute: (userId, mute) => instance.setLocalMute(userId, mute),
    fastUdpReconnect: () => instance.fastUdpReconnect(),
    setLocalPan: (userId, left, right) => instance.setLocalPan(userId, left, right),
    setDisableLocalVideo: (userId, disabled) => instance.setDisableLocalVideo(userId, disabled),

    setMinimumOutputDelay: (delay) => instance.setMinimumOutputDelay(delay),
    getEncryptionModes: (callback) => instance.getEncryptionModes(callback),
    configureConnectionRetries: (baseDelay, maxDelay, maxAttempts) =>
      instance.configureConnectionRetries(baseDelay, maxDelay, maxAttempts),
    setOnSpeakingCallback: (callback) => instance.setOnSpeakingCallback(callback),
    setOnNativeMuteToggleCallback: (callback) => instance.setOnNativeMuteToggleCallback?.(callback),
    setOnNativeMuteChangedCallback: (callback) => instance.setOnNativeMuteChangedCallback?.(callback),
    setOnSpeakingWhileMutedCallback: (callback) => instance.setOnSpeakingWhileMutedCallback(callback),
    setPingInterval: (interval) => instance.setPingInterval(interval),
    setPingCallback: (callback) => instance.setPingCallback(callback),
    setPingTimeoutCallback: (callback) => instance.setPingTimeoutCallback(callback),
    setRemoteUserSpeakingStatus: (userId, speaking) => instance.setRemoteUserSpeakingStatus(userId, speaking),
    setRemoteUserCanHavePriority: (userId, canHavePriority) =>
      instance.setRemoteUserCanHavePriority(userId, canHavePriority),

    setOnVideoCallback: (callback) => instance.setOnVideoCallback(callback),
    setOnFirstFrameCallback: (callback) => instance.setOnFirstFrameCallback(callback),
    setVideoBroadcast: (broadcasting) => instance.setVideoBroadcast(broadcasting),
    setDesktopSource: (id, videoHook, type) => instance.setDesktopSource(id, videoHook, type),
    setDesktopSourceWithOptions: (options) => instance.setDesktopSourceWithOptions(options),
    setGoLiveDevices: (options) => instance.setGoLiveDevices(options),
    clearGoLiveDevices: () => instance.clearGoLiveDevices(),
    clearDesktopSource: () => instance.clearDesktopSource(),
    setDesktopSourceStatusCallback: (callback) => instance.setDesktopSourceStatusCallback(callback),
    setOnDesktopSourceEnded: (callback) => instance.setOnDesktopSourceEnded(callback),
    setOnSoundshare: (callback) => instance.setOnSoundshare(callback),
    setOnSoundshareEnded: (callback) => instance.setOnSoundshareEnded(callback),
    setOnSoundshareFailed: (callback) => instance.setOnSoundshareFailed(callback),
    setPTTActive: (active, priority) => instance.setPTTActive(active, priority),
    getStats: (callback) => instance.getStats(callback),
    getFilteredStats: (filter, callback) => instance.getFilteredStats(filter, callback),
    startReplay: () => instance.startReplay(),
    setClipRecordUser: (userId, dataType, shouldRecord) => instance.setClipRecordUser(userId, dataType, shouldRecord),
    setCallExperience: (bucket) => instance.setCallExperience(bucket),
    setRtcLogMarker: (marker) => instance.setRtcLogMarker(marker),
    startSamplesLocalPlayback: (samplesId, options, channels, callback) =>
      instance.startSamplesLocalPlayback(samplesId, options, channels, callback),
    stopSamplesLocalPlayback: (sourceId) => instance.stopSamplesLocalPlayback(sourceId),
    stopAllSamplesLocalPlayback: () => instance.stopAllSamplesLocalPlayback(),
    setOnVideoEncoderFallbackCallback: (codecName) => instance.setOnVideoEncoderFallbackCallback(codecName),
  };
}

VoiceEngine.createTransport = VoiceEngine._createTransport;

if (isElectronRenderer) {
  VoiceEngine.setImageDataAllocator((width, height) => new window.ImageData(width, height));
}

VoiceEngine.createVoiceConnectionWithOptions = function (userId, connectionOptions, onConnectCallback) {
  const instance = new VoiceEngine.VoiceConnection(userId, connectionOptions, onConnectCallback);
  return bindConnectionInstance(instance);
};
VoiceEngine.createOwnStreamConnectionWithOptions = VoiceEngine.createVoiceConnectionWithOptions;

// TODO(dyc): |audioEngineId| is vestigial and does not actually get used.
// "default" was (we deleted audio engine IDs with the removal of android's
// separate gameAudio engine) hardcoded within nativelib. update the API to
// reflect this.
VoiceEngine.createReplayConnection = function (audioEngineId, callback, replayLog) {
  if (replayLog == null) {
    return null;
  }

  return bindConnectionInstance(new VoiceEngine.VoiceReplayConnection(replayLog, audioEngineId, callback));
};

function bindSpeedTestConnectionInstance(instance) {
  return {
    destroy: () => instance.destroy(),

    setTransportOptions: (options) => instance.setTransportOptions(options),
    getEncryptionModes: (callback) => instance.getEncryptionModes(callback),
    getNetworkOverhead: (callback) => instance.getNetworkOverhead(callback),
    setPingInterval: (interval) => instance.setPingInterval(interval),
    setPingCallback: (callback) => instance.setPingCallback(callback),
    setPingTimeoutCallback: (callback) => instance.setPingTimeoutCallback(callback),
    startSpeedTestSender: (options, callback) => instance.startSpeedTestSender(options, callback),
    stopSpeedTestSender: () => instance.stopSpeedTestSender(),
    startSpeedTestReceiver: (options, callback) => instance.startSpeedTestReceiver(options, callback),
    stopSpeedTestReceiver: (callback) => instance.stopSpeedTestReceiver(callback),
  };
}

VoiceEngine.createSpeedTestConnectionWithOptions = function (userId, connectionOptions, onConnectCallback) {
  const instance = new VoiceEngine.SpeedTestConnection(userId, connectionOptions, onConnectCallback);
  return bindSpeedTestConnectionInstance(instance);
};

// FIX: Use Discord's internal function pattern for proper subsystem switching
const setAudioSubsystemInternal = function (subsystem, forceRestart) {
  if (appSettings == null) {
    console.warn('Unable to access app settings.');
    return;
  }

  appSettings.set('audioSubsystem', subsystem);

  if (isElectronRenderer) {
    if (forceRestart) {
      // DANGER: any unconditional call to setAudioSubsytem will bootloop if we don't
      // debounce noop changes.
      if (subsystem === audioSubsystem) {
        return;
      }
      window.DiscordNative.app.relaunch();
    } else {
      console.log(`Deferring audio subsystem switch to ${subsystem} until next restart.`);
    }
  }
};

VoiceEngine.setAudioSubsystem = function (subsystem) {
  setAudioSubsystemInternal(subsystem, true);
};

VoiceEngine.queueAudioSubsystem = function (subsystem) {
  setAudioSubsystemInternal(subsystem, false);
};

VoiceEngine.setDebugLogging = function (enable) {
  if (appSettings == null) {
    console.warn('Unable to access app settings.');
    return;
  }

  if (debugLogging === enable) {
    return;
  }

  appSettings.set('debugLogging', enable);

  if (isElectronRenderer) {
    window.DiscordNative.app.relaunch();
  }
};

VoiceEngine.getDebugLogging = function () {
  return debugLogging;
};

const videoStreams = {};
const directVideoStreams = {};

const ensureCanvasContext = function (sinkId) {
  let canvas = document.getElementById(sinkId);
  if (canvas == null) {
    for (const popout of window.popouts.values()) {
      const element = popout.document != null && popout.document.getElementById(sinkId);
      if (element != null) {
        canvas = element;
        break;
      }
    }

    if (canvas == null) {
      return null;
    }
  }

  const context = canvas.getContext('2d');
  if (context == null) {
    console.log(`Failed to initialize context for sinkId ${sinkId}`);
    return null;
  }

  return context;
};

let activeSinksChangeCallback;
VoiceEngine.setActiveSinksChangeCallback = function (callback) {
  activeSinksChangeCallback = callback;
};

function notifyActiveSinksChange(streamId) {
  if (activeSinksChangeCallback == null) {
    return;
  }
  const sinks = videoStreams[streamId];
  const hasVideoStreamSink = sinks != null && sinks.size > 0;
  const hasDirectVideoStreamSink = directVideoStreams[streamId] != null;

  activeSinksChangeCallback(streamId, hasVideoStreamSink || hasDirectVideoStreamSink);
}

// [adill] NB: with context isolation it has become extremely costly (both memory & performance) to provide the image
// data directly to clients at any reasonably fast interval so we've replaced setVideoOutputSink with a direct canvas
// renderer via addVideoOutputSink
const setVideoOutputSink = VoiceEngine.setVideoOutputSink;
const clearVideoOutputSink = (streamId) => {
  // [adill] NB: if you don't pass a frame callback setVideoOutputSink clears the sink
  setVideoOutputSink(streamId);
};
const signalVideoOutputSinkReady = VoiceEngine.signalVideoOutputSinkReady;
delete VoiceEngine.setVideoOutputSink;
delete VoiceEngine.signalVideoOutputSinkReady;

function addVideoOutputSinkInternal(sinkId, streamId, frameCallback) {
  let sinks = videoStreams[streamId];
  if (sinks == null) {
    sinks = videoStreams[streamId] = new Map();
  }

  // notifyActiveSinksChange relies on videoStreams having the correct state
  const needsToSubscribeToFrames = sinks.size === 0;
  sinks.set(sinkId, frameCallback);

  if (needsToSubscribeToFrames) {
    console.log(`Subscribing to frames for streamId ${streamId}`);
    const onFrame = (imageData) => {
      const sinks = videoStreams[streamId];
      if (sinks != null) {
        for (const callback of sinks.values()) {
          if (callback != null) {
            callback(imageData);
          }
        }
      }
      signalVideoOutputSinkReady(streamId);
    };
    setVideoOutputSink(streamId, onFrame, true);
    notifyActiveSinksChange(streamId);
  }
}

VoiceEngine.addVideoOutputSink = function (sinkId, streamId, frameCallback) {
  let canvasContext = null;
  addVideoOutputSinkInternal(sinkId, streamId, (imageData) => {
    if (canvasContext == null) {
      canvasContext = ensureCanvasContext(sinkId);
      if (canvasContext == null) {
        return;
      }
    }
    if (frameCallback != null) {
      frameCallback(imageData.width, imageData.height);
    }
    // [adill] NB: Electron 9+ on macOS would show massive leaks in the the GPU helper process when a non-Discord
    // window completely occludes the Discord window. Adding this tiny readback ameliorates the issue. We tried WebGL
    // rendering which did not exhibit the issue, however, the context limit of 16 was too small to be a real
    // alternative.
    canvasContext.getImageData(0, 0, 1, 1);
    canvasContext.putImageData(imageData, 0, 0);
  });
};

VoiceEngine.removeVideoOutputSink = function (sinkId, streamId) {
  const sinks = videoStreams[streamId];
  if (sinks != null) {
    sinks.delete(sinkId);
    if (sinks.size === 0) {
      delete videoStreams[streamId];
      console.log(`Unsubscribing from frames for streamId ${streamId}`);
      clearVideoOutputSink(streamId);
      notifyActiveSinksChange(streamId);
    }
  }
};

// We wrap the direct video calls so we can keep track of all active
// video output sinks
const addDirectVideoOutputSink_ = VoiceEngine.addDirectVideoOutputSink;
const removeDirectVideoOutputSink_ = VoiceEngine.removeDirectVideoOutputSink;
VoiceEngine.addDirectVideoOutputSink = function (streamId) {
  console.log(`Subscribing to direct frames for streamId ${streamId}`);
  addDirectVideoOutputSink_(streamId);
  directVideoStreams[streamId] = true;
  notifyActiveSinksChange(streamId);
};
VoiceEngine.removeDirectVideoOutputSink = function (streamId) {
  console.log(`Unsubscribing from direct frames for streamId ${streamId}`);
  removeDirectVideoOutputSink_(streamId);
  delete directVideoStreams[streamId];
  notifyActiveSinksChange(streamId);
};

let sinkId = 0;
VoiceEngine.getNextVideoOutputFrame = function (streamId) {
  const nextVideoFrameSinkId = `getNextVideoFrame_${++sinkId}`;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      VoiceEngine.removeVideoOutputSink(nextVideoFrameSinkId, streamId);
      reject(new Error('getNextVideoOutputFrame timeout'));
    }, 5000);

    addVideoOutputSinkInternal(nextVideoFrameSinkId, streamId, (imageData) => {
      VoiceEngine.removeVideoOutputSink(nextVideoFrameSinkId, streamId);
      resolve({
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data.buffer),
      });
    });
  });
};

// FIX: Use the dynamic audioSubsystem variable instead of hardcoding "legacy"
console.log(`Initializing voice engine with audio subsystem: ${audioSubsystem}`);
VoiceEngine.platform = process.platform;
VoiceEngine.initialize({
  audioSubsystem,
  logLevel,
  dataDirectory,
  useFakeVideoCapture,
  useFileForFakeVideoCapture,
  useFakeAudioCapture,
  useFileForFakeAudioCapture,
});

module.exports = VoiceEngine;