import React from "react";

const RefundProofModal = ({ imageUrl, onClose }) => {
    if (!imageUrl) return null;
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
            }}
            onClick={onClose}
        >
            <div
                style={{ position: 'relative', background: 'transparent' }}
                onClick={e => e.stopPropagation()}
            >
                <img
                    src={imageUrl}
                    alt="Refund proof large"
                    style={{ maxWidth: '90vw', maxHeight: '90vh', border: '2px solid #fff', borderRadius: 8 }}
                />
                <button
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: 32,
                        height: 32,
                        fontSize: 20,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    onClick={onClose}
                    aria-label="Close"
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default RefundProofModal;
