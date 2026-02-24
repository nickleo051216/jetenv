import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

export const generateQuoteNumber = () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const randomSeq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `J-${yy}-${mm}${randomSeq}`;
};

// 自動取得下一個流水號邏輯
export const getNextQuoteNumber = async (dbInstance, currentAppId) => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `J-${yy}-${mm}`; // 例如：J-25-12

    try {
        const q = query(
            collection(dbInstance, 'artifacts', currentAppId, 'public', 'data', 'quotations'),
            orderBy('quoteNumber', 'desc'),
            limit(1)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const lastId = snapshot.docs[0].data().quoteNumber;
            if (lastId && lastId.startsWith(prefix)) {
                const baseId = lastId.split('-V')[0];
                const lastSeq = parseInt(baseId.slice(-3));

                if (!isNaN(lastSeq)) {
                    const nextSeq = String(lastSeq + 1).padStart(3, '0');
                    return `${prefix}${nextSeq}`;
                }
            }
        }
        return `${prefix}001`;
    } catch (error) {
        console.error("流水號生成失敗，使用亂數代替:", error);
        const randomSeq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
        return `${prefix}${randomSeq}`;
    }
};

export const formatDate = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    return d.toISOString().split('T')[0];
};

export const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};
