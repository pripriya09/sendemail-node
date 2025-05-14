import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const socket = io('http://localhost:3000');

const ClientCall = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const screenStreamRef = useRef(null); // Track screen-sharing stream
  const navigate = useNavigate();

  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  useEffect(() => {
    async function init() {
      try {
        console.log('Initializing ClientCall...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch(err => console.warn('Local play error:', err));
        }
        const pc = new RTCPeerConnection(config);
        stream.getTracks().forEach(track => {
          console.log('Adding track to peer connection:', track);
          pc.addTrack(track, stream);
        });
        setPeerConnection(pc);
        pc.ontrack = (event) => {
          console.log('Received remote track:', event);
          const incomingStream = event.streams[0];
          if (remoteVideoRef.current && incomingStream) {
            console.log('Setting remote stream:', incomingStream);
            remoteVideoRef.current.srcObject = incomingStream;
            remoteVideoRef.current.play().catch(err => console.error('Remote play error:', err));
          }
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('ice-candidate', event.candidate);
          }
        };
        pc.onconnectionstatechange = () => {
          console.log('Connection state:', pc.connectionState);
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('Sending offer:', offer);
        socket.emit('offer', offer);
        setIsInitialized(true);
      } catch (err) {
        console.error('Error initializing:', err);
        alert('Failed to initialize. Check camera and microphone permissions.');
        setIsInitialized(false);
      }
    }
    init();
    return () => {
      if (peerConnection) peerConnection.close();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const endCall = () => {
    console.log('Ending call...');
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
      setIsScreenSharing(false);
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      socket.emit('end-call');
      setIsInitialized(false);
      socket.emit('clear-form');
      setIsInitialized(false);
      setLocalStream(null);
      // screenStreamRef(null);
      setTimeout(() => navigate('/summary'), 500);
    
    }
  };
 

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
      console.log('Video toggled:', !isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !isAudioOn;
      setIsAudioOn(!isAudioOn);
      console.log('Audio toggled:', !isAudioOn);
    }
  };

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.2, 2));
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.2, 1));
  };

  const startScreenShare = async () => {
    try {
      console.log('Starting screen share...');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
          console.log('Screen track replaced');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream; // Show screen in local video
          }
        }
        setIsScreenSharing(true);
        socket.emit('screen-shared');
        screenTrack.onended = () => {
          console.log('Screen sharing ended');
          stopScreenShare();
        };
      }
    } catch (err) {
      console.error('Error starting screen share:', err);
      alert('Failed to start screen share. Ensure permissions are granted.');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (peerConnection && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
        console.log('Restored webcam track');
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream; // Restore webcam in local video
        }
      }
    }
    setIsScreenSharing(false);
    socket.emit('screen-ended');
  };

  useEffect(() => {
    socket.on('connect', () => console.log('Socket connected in ClientCall:', socket.id));
    socket.on('answer', async (answer) => {
      if (peerConnection) {
        console.log('Received answer:', answer);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer)).catch(err => console.error('Error setting remote description:', err));
      }
    });
    socket.on('ice-candidate', async (candidate) => {
      if (peerConnection) {
        console.log('Received ICE candidate:', candidate);
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error('Error adding ICE candidate:', err));
      }
    });
    socket.on('end-call', () => {
      console.log('Received end-call event');
      if (peerConnection) {
        peerConnection.close();
        setPeerConnection(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setIsInitialized(false);
     
      }
        setTimeout(() => navigate('/summary'), 500);
    });
    socket.on('call-declined', () => {
      console.log('Call declined by agent');
      alert('The agent has declined the call. Please try again later.');
      endCall();
    });
    // socket.on('trigger-start-call', async () => {
    //   console.log('Received trigger to start call');
    //   await startCall();
    // });
    return () => {
      socket.off('answer');
      socket.off('ice-candidate');
      // socket.off('trigger-start-call');
      socket.off('end-call');
      socket.off('call-declined');
      socket.off('connect');
    };
  }, [peerConnection,isInitialized, navigate]);

  return (
    <div className="main-container client-call">
      <div className="video-container">
        <div className="client-video-wrapper">
          <video ref={localVideoRef} autoPlay muted style={{ transform: `scale(${zoomLevel})` }} />
          <p>Client Video {isScreenSharing ? '(Screen Sharing)' : ''}</p>
        </div>
        <div className="agent-video-wrapper">
          <video ref={remoteVideoRef} autoPlay style={{ transform: `scale(${zoomLevel})` }} />
          <p>Agent Video</p>
        </div>
      </div>
      <div className="button-container">
        <button onClick={toggleVideo} className="video-off" title={isVideoOn ? 'Video Off' : 'Video On'}>
          <i className={isVideoOn ? "fas fa-video" : "fas fa-video-slash"}></i>
        </button>
        <button onClick={toggleAudio} className="audio-off" title={isAudioOn ? 'Audio Off' : 'Audio On'}>
          <i className={isAudioOn ? "fas fa-microphone" : "fas fa-microphone-slash"}></i>
        </button>
        <button onClick={zoomIn} disabled={zoomLevel >= 2} className="zoom" title="Zoom In">
          <i className="fas fa-search-plus"></i>
        </button>
        <button onClick={zoomOut} disabled={zoomLevel <= 1} className="zoom" title="Zoom Out">
          <i className="fas fa-search-minus"></i>
        </button>
        <button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className="screen-share"
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          <i className={isScreenSharing ? "fas fa-stop" : "fas fa-desktop"}></i>
        </button>
        <button onClick={endCall} disabled={!isInitialized} className="end-call" title="End Call">
          <i className="fas fa-phone-slash"></i>
        </button>
        
      </div>
    </div>
  );
};

export default ClientCall;