import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

const Toast = ({ isVisible, message, type = 'success', onClose }) => {
    const [isRendered, setIsRendered] = useState(false);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setIsRendered(true);
            setIsFading(false);
            const timer = setTimeout(() => {
                setIsFading(true);
                setTimeout(() => {
                    setIsRendered(false);
                    onClose();
                }, 800);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    if (!isRendered) return null;

    const isError = type === 'error';

    return (
        <div
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[10000] transition-all duration-700 ease-out ${isFading ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
                }`}
        >
            <div className={`bg-gradient-to-tr ${isError ? 'from-orange-600 to-red-700' : 'from-teal-600 to-teal-800'
                } text-white px-8 py-3.5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.2)] flex items-center gap-4 border border-white/20 backdrop-blur-sm`}>
                <div className="bg-white/20 p-1 rounded-full">
                    {isError ? <AlertTriangle className="w-5 h-5 text-white" /> : <CheckCircle className="w-5 h-5 text-white" />}
                </div>
                <span className="font-semibold tracking-wide">{message}</span>
            </div>
        </div>
    );
};

export default Toast;
