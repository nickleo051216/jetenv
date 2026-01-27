import React from 'react';
import { Loader2, Send } from 'lucide-react';

const SendingOverlay = ({ isVisible, message }) => {
    if (!isVisible) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm mx-4">
                <div className="relative">
                    <Loader2 className="w-14 h-14 text-teal-600 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Send className="w-5 h-5 text-teal-700" />
                    </div>
                </div>
                <div className="text-lg font-semibold text-gray-800 text-center">{message}</div>
                <div className="text-sm text-gray-500">請勿關閉視窗</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-teal-600 h-full rounded-full animate-pulse" style={{ width: '60%' }}></div>
                </div>
            </div>
        </div>
    );
};

export default SendingOverlay;
