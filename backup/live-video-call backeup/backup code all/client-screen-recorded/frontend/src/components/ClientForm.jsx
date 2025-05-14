import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

const ClientForm = () => {
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedFormData = { ...formData, [name]: value };
    setFormData(updatedFormData);
    socket.emit('form-update', updatedFormData);
    console.log('Form updated:', updatedFormData);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      alert('Please fill out all fields.');
      return;
    }
    console.log('Submitting form:', formData);
    socket.emit('form-submit', formData);
    alert('Form submitted! Opening call page and waiting for agent.');
    const callWindow = window.open('/call', '_blank');
    if (callWindow) {
      callWindow.onload = () => {
        console.log('Call page loaded, triggering start-call');
        socket.emit('trigger-start-call');
      };
    } else {
      alert('Failed to open call page. Please allow pop-ups and try again.');
    }
  };

  useEffect(() => {
    socket.on('connect', () => console.log('Socket connected in ClientForm:', socket.id));
    socket.on('form-update', (data) => {
      setFormData(data);
      console.log('Received form-update:', data);
    });
    socket.on('clear-form', () => {
      setFormData({ name: '', email: '' });
      console.log('Form cleared');
    });
    socket.on('agent-form-submitted', () => {
      console.log('Agent submitted form');
      alert('Agent has reviewed and submitted your form. The form will now be cleared.');
      setFormData({ name: '', email: '' });
    });
    socket.on('call-declined', () => {
      console.log('Call declined by agent');
      alert('The agent has declined the call. Please try again later.');
      setFormData({ name: '', email: '' });
    });
    return () => {
      socket.off('form-update');
      socket.off('clear-form');
      socket.off('agent-form-submitted');
      socket.off('call-declined');
      socket.off('connect');
    };
  }, []);

  return (
    <div className="form-container client-form">
      <div className="form-content">
        <h3>Client Form</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Name:
            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
          </label>
          <br />
          <label>
            Email:
            <input type="email" name="email" value={formData.email} onChange={handleChange} required />
          </label>
          <br />
          <button type="submit" className="submit">
            <i className="fas fa-paper-plane mr-2"></i> Submit and Proceed to Call
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClientForm;