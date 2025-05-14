import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

const AgentView = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1); // For client video
  const [agentZoomLevel, setAgentZoomLevel] = useState(1); // For agent video
  const [agentPosition, setAgentPosition] = useState({ left: 10, top: 10 }); // Dynamic position
  const [isDragging, setIsDragging] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [showStopRecordingModal, setShowStopRecordingModal] = useState(false);
  const recordedChunks = useRef([]);
  const clientVideoWrapperRef = useRef(null);

  const agentDetails = { name: 'Agent John Doe' };
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  useEffect(() => {
    async function init() {
      try {
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
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        setPeerConnection(pc);
        pc.ontrack = (event) => {
          const incomingStream = event.streams[0];
          if (event.track.kind === 'video' && remoteVideoRef.current && incomingStream !== localStream) {
            if (remoteStream !== incomingStream) {
              setRemoteStream(incomingStream);
              remoteVideoRef.current.srcObject = incomingStream;
              remoteVideoRef.current.play().catch(err => console.error('Remote play error:', err));
            }
          }
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
          }
        };
        setIsInitialized(true);
      } catch (err) {
        console.error('Error initializing:', err);
        alert('Failed to initialize. Check DroidCam and permissions.');
        setIsInitialized(false);
      }
    }
    init();
  }, []);

  const acceptCall = async (offer) => {
    if (!peerConnection || !isInitialized) return;
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', answer);
    } catch (err) {
      console.error('Error accepting call:', err);
    }
  };

  const endCall = () => {
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
      setIsScreenSharing(false);
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setRemoteStream(null);
      socket.emit('end-call');
      const summaryData = { formData, agentName: agentDetails.name };
      socket.emit('call-summary', summaryData);
      localStorage.setItem('callSummary', JSON.stringify(summaryData));
      socket.emit('clear-form');
      setFormData({ name: '', email: '' });
      setIsInitialized(false);
      if (isRecording) {
        stopRecording();
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !isAudioOn;
      setIsAudioOn(!isAudioOn);
    }
  };

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.2, 2));
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.2, 1));
  };

  const agentZoomIn = () => {
    setAgentZoomLevel(prev => Math.min(prev + 0.2, 2));
  };

  const agentZoomOut = () => {
    setAgentZoomLevel(prev => Math.max(prev - 0.2, 1));
  };

  const toggleAgentZoom = () => {
    if (agentZoomLevel < 1.99) { // Use < 1.99 to account for floating-point precision
      agentZoomIn();
    } else {
      agentZoomOut();
    }
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragMove = (e) => {
    if (!isDragging || !clientVideoWrapperRef.current) return;

    const wrapper = clientVideoWrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const videoWidth = 150; // Agent video width
    const videoHeight = 100; // Agent video height

    // Calculate new position
    let newLeft = e.clientX - rect.left - videoWidth / 2;
    let newTop = e.clientY - rect.top - videoHeight / 2;

    // Constrain within client video bounds
    newLeft = Math.max(0, Math.min(newLeft, rect.width - videoWidth));
    newTop = Math.max(0, Math.min(newTop, rect.height - videoHeight - 40)); // Account for label

    setAgentPosition({ left: newLeft, top: newTop });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedFormData = { ...formData, [name]: value };
    setFormData(updatedFormData);
    socket.emit('form-update', updatedFormData);
  };

  const handleAgentSubmit = (e) => {
    e.preventDefault();
    socket.emit('form-submit', formData);
    const summaryData = { formData, agentName: agentDetails.name };
    socket.emit('call-summary', summaryData);
    localStorage.setItem('callSummary', JSON.stringify(summaryData));
    socket.emit('agent-form-submitted');
    alert('Form submitted by agent!');
    setFormData({ name: '', email: '' });
    socket.emit('clear-form');
  };

  const handleAcceptCall = () => {
    setShowCallModal(false);
    socket.emit('trigger-start-call');
  };

  const handleDeclineCall = () => {
    setShowCallModal(false);
    socket.emit('call-declined');
    socket.emit('clear-form');
    setFormData({ name: '', email: '' });
  };

  const startRecording = () => {
    if (!remoteStream) {
      alert('No remote stream available to record.');
      return;
    }
    recordedChunks.current = [];
    const recorder = new MediaRecorder(remoteStream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${new Date().toISOString()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      recordedChunks.current = [];
    };
    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    setShowStopRecordingModal(true);
  };

  const confirmStopRecording = () => {
    stopRecording();
    setShowStopRecordingModal(false);
  };

  const cancelStopRecording = () => {
    setShowStopRecordingModal(false);
  };

  useEffect(() => {
    socket.on('connect', () => console.log('Socket connected in AgentView:', socket.id));
    socket.on('offer', (offer) => {
      acceptCall(offer);
    });
    socket.on('ice-candidate', (candidate) => {
      if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });
    socket.on('end-call', () => {
      if (peerConnection) {
        peerConnection.close();
        setPeerConnection(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setRemoteStream(null);
        setIsInitialized(false);
      }
      const summaryData = { formData, agentName: agentDetails.name };
      socket.emit('call-summary', summaryData);
      localStorage.setItem('callSummary', JSON.stringify(summaryData));
      if (isRecording) {
        stopRecording();
      }
    });
    socket.on('screen-shared', () => {
      setIsScreenSharing(true);
      alert('Client is sharing their screen.');
    });
    socket.on('screen-ended', () => {
      setIsScreenSharing(false);
    });
    socket.on('form-update', (data) => {
      setFormData(data);
    });
    socket.on('form-submit', (data) => {
      setShowCallModal(true);
    });
    socket.on('clear-form', () => {
      setFormData({ name: '', email: '' });
    });
    return () => {
      socket.off('offer');
      socket.off('ice-candidate');
      socket.off('end-call');
      socket.off('screen-shared');
      socket.off('screen-ended');
      socket.off('form-update');
      socket.off('form-submit');
      socket.off('clear-form');
      socket.off('connect');
    };
  }, [peerConnection, isScreenSharing, remoteStream, isRecording]);

  return (
    <div className="main-container">
      <div className="left-section">
        <div className="video-container">
          <div className="client-video-wrapper" ref={clientVideoWrapperRef}>
            <video ref={remoteVideoRef} autoPlay style={{ transform: `scale(${zoomLevel})` }} />
            <p>Client Video {isScreenSharing ? '(Screen Sharing)' : ''}</p>
            <div className="agent-video-wrapper" style={{ left: `${agentPosition.left}px`, top: `${agentPosition.top}px` }}>
              <video ref={localVideoRef} autoPlay muted style={{ transform: `scale(${agentZoomLevel})` }} />
              <div className="zoom-icon" onClick={toggleAgentZoom}>
                <i className="fas fa-search"></i>
              </div>
              <div className="drag-icon" onMouseDown={handleDragStart}>
                <i className="fas fa-arrows-alt"></i>
              </div>
              <p>Agent Video</p>
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
              <button onClick={endCall} disabled={!isInitialized} className="end-call" title="End Call">
                <i className="fas fa-phone-slash"></i>
              </button>
              <button
                onClick={isRecording ? handleStopRecording : startRecording}
                disabled={!isInitialized}
                className="record-button"
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                <i className={isRecording ? "fas fa-stop" : "fas fa-record-vinyl"}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="form-container">
        <h3>Agent Form Review</h3>
        <form onSubmit={handleAgentSubmit}>
          <label>
            Name:
            <input type="text" name="name" value={formData.name} onChange={handleChange} />
          </label>
          <br />
          <label>
            Email:
            <input type="email" name="email" value={formData.email} onChange={handleChange} />
          </label>
          <br />
          <button type="submit" className="submit">
            <i className="fas fa-check mr-2"></i> Submit
          </button>
        </form>
      </div>

      {showCallModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Incoming Call Request</h2>
            <p>Client has submitted the form. Please review and decide to accept or decline the call.</p>
            <div className="modal-buttons">
              <button onClick={handleDeclineCall} className="decline-button">
                <i className="fas fa-times mr-2"></i> Decline
              </button>
              <button onClick={handleAcceptCall} className="accept-button">
                <i className="fas fa-phone mr-2"></i> Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {showStopRecordingModal && (
        <div className="modal-overlay">
          <div className="modal-content stop-recording-modal">
            <h2>Confirm Stop Recording</h2>
            <p>Are you sure you want to end the recording?</p>
            <div className="modal-buttons">
              <button onClick={cancelStopRecording} className="cancel-stop-button">
                <i className="fas fa-times mr-2"></i> Cancel
              </button>
              <button onClick={confirmStopRecording} className="confirm-stop-button">
                <i className="fas fa-check mr-2"></i> Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentView;