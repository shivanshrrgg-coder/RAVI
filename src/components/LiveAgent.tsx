import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { Mic, MicOff, Video, VideoOff, X, MessageSquare, Sparkles, Loader2, Camera, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LiveAgentProps {
  onCaptureImage: (base64: string) => void;
  onClose: () => void;
}

export const LiveAgent: React.FC<LiveAgentProps> = ({ onCaptureImage, onClose }) => {
  useEffect(() => {
    console.log("LiveAgent component mounted");
  }, []);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const [status, setStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startSession = async () => {
    console.log("startSession initiated");
    if (isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setErrorMsg(null);
    setAiResponse("");
    setStatus("Initializing...");
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing in environment.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      setStatus("Requesting camera & microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      }).catch(err => {
        throw new Error(`Camera/Mic access denied: ${err.message}`);
      });

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      setStatus("Connecting to Gemini Live...");
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      await audioCtx.resume();
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        callbacks: {
          onopen: () => {
            console.log("Live session opened successfully");
            setIsConnected(true);
            setIsConnecting(false);
            setStatus("Live");
            
            sessionPromise.then((session) => {
              sessionRef.current = session;
              startAudioStreaming(session);
              startVideoStreaming(session);
              
              // Send an initial greeting to trigger the AI to speak
              session.sendRealtimeInput({
                text: "Hello! I'm here. Please greet the user and tell them you can see them through the camera."
              });
            }).catch(err => {
              console.error("Error getting session from promise:", err);
              setAiResponse("Session initialization failed.");
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log("Live message received:", message);
            
            try {
              // Handle model turn (audio/text)
              if (message.serverContent?.modelTurn?.parts) {
                const parts = message.serverContent.modelTurn.parts;
                
                const audioPart = parts.find(p => p.inlineData);
                if (audioPart?.inlineData?.data) {
                  enqueueAudio(audioPart.inlineData.data);
                }
                
                const textPart = parts.find(p => p.text);
                if (textPart?.text) {
                  setAiResponse(prev => prev + textPart.text);
                }
              }

              // Handle server content (interruption)
              if (message.serverContent?.interrupted) {
                console.log("AI interrupted");
                audioQueueRef.current = [];
                isPlayingRef.current = false;
              }

              // Handle tool calls
              if (message.toolCall) {
                for (const call of message.toolCall.functionCalls) {
                  if (call.name === 'capture_product_image') {
                    captureAndSend();
                    sessionPromise.then(session => {
                      if (session) {
                        session.sendToolResponse({
                          functionResponses: [{
                            name: 'capture_product_image',
                            response: { success: true, message: "Image captured and processing started." },
                            id: call.id
                          }]
                        });
                      }
                    });
                  }
                }
              }
            } catch (err) {
              console.error("Error processing message:", err);
            }
          },
          onclose: (event: any) => {
            console.log("Live session closed by server:", event);
            setStatus("Disconnected");
            if (isConnected) {
              setErrorMsg("Network connection lost. Please check your internet and try again.");
              stopSession();
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error Callback:", err);
            if (err.message?.includes("expired") || err.message?.includes("auth") || err.message?.includes("quota")) {
              setErrorMsg(`Session error: ${err.message || 'Unknown error'}`);
              stopSession();
            } else if (err.message?.includes("network") || err.message?.includes("failed to connect")) {
              setErrorMsg("Network problem detected. Your internet might be slow or blocking the connection.");
              stopSession();
            } else {
              console.warn("Transient error, attempting to stay connected...");
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are SnapList AI Live Agent, a professional ecommerce assistant and shopping expert. You have UNRESTRICTED access to the ENTIRE INTERNET via Google Search. \n\nCORE CAPABILITIES:\n1. PRODUCT IDENTIFICATION: You can see through the camera. Identify any product shown with high precision.\n2. PRICE COMPARISON: When a user shows a product or mentions one, you MUST proactively search the entire web (Amazon, Flipkart, Meesho, Myntra, etc.) to find where it is currently selling at the CHEAPEST price. Provide the user with the price and the name of the platform so they can buy it from there.\n3. LISTING GENERATION: If the user wants to sell, use the 'capture_product_image' tool to start the listing process.\n\nCRITICAL: You are MULTILINGUAL. Respond in the same language the user speaks (Hindi, English, or Hinglish). Be helpful, professional, and concise. Talk like a real human assistant.",
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [{
                name: "capture_product_image",
                description: "Captures the current camera frame to identify the product and generate a full ecommerce listing.",
                parameters: { type: Type.OBJECT, properties: {} }
              }]
            }
          ]
        },
      });

      // Add a timeout to the connection
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout. The service might be temporarily unavailable or your network is blocking WebSockets.")), 20000)
      );

      // Await the promise to catch initialization errors
      await Promise.race([sessionPromise, timeoutPromise]);

    } catch (err: any) {
      console.error("Failed to start session:", err);
      setAiResponse(err.message || "Failed to connect. Please try again.");
      setIsConnecting(false);
      setStatus("Error");
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  };

  const startAudioStreaming = (session: any) => {
    if (!audioContextRef.current || !streamRef.current) return;

    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    processorRef.current.onaudioprocess = (e) => {
      if (!isMicOn || !sessionRef.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      // Efficiently convert to base64
      const uint8 = new Uint8Array(pcmData.buffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64Data = btoa(binary);
      
      try {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
        session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
      } catch (err) {
        console.error("Failed to send audio input:", err);
      }
    };

    source.connect(processorRef.current);
    processorRef.current.connect(audioContextRef.current.destination);
  };

  const startVideoStreaming = (session: any) => {
    const sendFrame = () => {
      if (!isConnected || !isVideoOn || !sessionRef.current) return;
      if (videoRef.current && canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        if (context) {
          // Smaller frame for better network performance
          canvasRef.current.width = 240;
          canvasRef.current.height = 180;
          context.drawImage(videoRef.current, 0, 0, 240, 180);
          // Lower quality for faster transmission
          const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.3).split(',')[1];
          try {
            session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
          } catch (err) {
            console.error("Failed to send video frame:", err);
          }
        }
      }
      // Send frame every 1.5s to save bandwidth
      setTimeout(() => requestAnimationFrame(sendFrame), 1500);
    };
    requestAnimationFrame(sendFrame);
  };

  const enqueueAudio = (base64Data: string) => {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 0x7FFF;
    }
    audioQueueRef.current.push(float32Data);
    if (!isPlayingRef.current) playNextInQueue();
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const data = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, data.length, 16000);
    buffer.getChannelData(0).set(data);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    try {
      source.start();
    } catch (e) {
      console.error("Error starting audio source:", e);
      isPlayingRef.current = false;
      playNextInQueue();
    }
  };

  const captureAndSend = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        // Limit max dimension to 1024px for better network performance
        const maxDim = 1024;
        let width = videoRef.current.videoWidth;
        let height = videoRef.current.videoHeight;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        context.drawImage(videoRef.current, 0, 0, width, height);
        const base64 = canvasRef.current.toDataURL('image/jpeg', 0.7).split(',')[1];
        onCaptureImage(base64);
      }
    }
  };

  const stopSession = () => {
    setIsConnected(false);
    setIsConnecting(false);
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col h-[80vh]">
        {/* Header */}
        <div className="p-6 border-bottom border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">SnapList Live Agent</h3>
              <div className="flex items-center gap-2">
                <p className="text-zinc-400 text-xs">Gemini 2.5 Flash Native Audio</p>
                <div className="flex items-center gap-2">
                  {status && (
                    <>
                      <span className="text-zinc-600">•</span>
                      <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">{status}</span>
                    </>
                  )}
                  <span className="text-zinc-600">•</span>
                  <span className="text-amber-500 text-[10px] font-bold uppercase tracking-wider">Network Optimized</span>
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {!isConnected && !isConnecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center z-30">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center animate-pulse">
                {errorMsg ? <LogOut className="w-10 h-10 text-red-500" /> : <MessageSquare className="w-10 h-10 text-emerald-500" />}
              </div>
              <div>
                <h4 className="text-white text-xl font-bold mb-2">
                  {errorMsg ? "Connection Interrupted" : "Start Live Conversation"}
                </h4>
                <p className="text-zinc-400 max-w-sm">
                  {errorMsg || "Talk to Gemini in real-time. Show your product to the camera and ask Gemini to list it for you."}
                </p>
                {errorMsg && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-left max-w-sm mx-auto">
                    <p className="text-xs text-red-400 font-bold mb-2 uppercase tracking-wider">Troubleshooting:</p>
                    <ul className="text-[10px] text-zinc-400 space-y-1 list-disc list-inside">
                      <li>Check if your internet is stable.</li>
                      <li>Disable VPN/Proxy that might block WebSockets.</li>
                      <li>Ensure Camera & Mic permissions are granted.</li>
                      <li>Try refreshing the page or using Chrome.</li>
                    </ul>
                  </div>
                )}
              </div>
              <button 
                onClick={startSession}
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-emerald-900/20 flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {errorMsg ? "Try Reconnecting" : "Connect Now"}
              </button>
            </div>
          )}

          {isConnecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900/90 z-20">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <p className="text-emerald-500 font-medium">{status}</p>
            </div>
          )}

          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className={cn(
              "w-full h-full object-cover transition-opacity duration-500",
              isConnected ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* AI Response Overlay */}
          <AnimatePresence>
            {aiResponse && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-24 left-6 right-6 p-4 bg-emerald-600/90 backdrop-blur-md rounded-2xl text-white shadow-xl border border-emerald-400/30"
              >
                <p className="text-sm leading-relaxed">{aiResponse}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center gap-4">
          <button 
            onClick={() => setIsMicOn(!isMicOn)}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              isMicOn ? "bg-zinc-800 text-white" : "bg-red-500/20 text-red-500"
            )}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              isVideoOn ? "bg-zinc-800 text-white" : "bg-red-500/20 text-red-500"
            )}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={captureAndSend}
            disabled={!isConnected}
            className="flex-1 max-w-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
          >
            <Camera className="w-5 h-5" />
            Capture Frame
          </button>
        </div>
      </div>
    </motion.div>
  );
};
