import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  Layers, 
  Banknote, 
  Globe, 
  User, 
  Calendar, 
  Plus, 
  Minus, 
  Package, 
  Check, 
  Printer, 
  Hash, 
  CreditCard 
} from 'lucide-react';
import { 
  collection, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';

export interface ReturnItemRecord {
  productId: string;
  productName: string;
  brand: string;
  modelNumber: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  discountDeduction?: number;
  refundAmount: number;
  returnedSerials?: string[];
}

export interface SaleReturnRecord {
  id: string;
  returnDate: string;
  items: ReturnItemRecord[];
  totalRefund: number;
  refundMode: 'Cash' | 'Online' | 'Customer Credit';
  bankAccountNumber?: string | null;
  bankName?: string | null;
  reason: string;
  notes?: string;
  restocked: boolean;
  createdAt?: any;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  productType?: 'Serials' | 'Without Serials' | string;
  unit?: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
}

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
}

interface SerialNumber {
  id: string;
  productId: string;
  serialNumber: string;
  status: 'Available' | 'Sold';
}

interface SaleItem {
  productId: string;
  productName: string;
  brand: string;
  modelNumber: string;
  category: string;
  quantity: number;
  salePrice: number;
  discount: number;
  warranty: string;
  subtotal: number;
  selectedSerials: string[];
  returnedQuantity?: number;
  returnedSerials?: string[];
}

interface Sale {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  total: number;
  date: string;
  status: string;
  items?: SaleItem[];
  paymentMode?: 'Cash' | 'Online';
  bankAccountNumber?: string | null;
  bankName?: string | null;
  accountTitle?: string | null;
  returns?: SaleReturnRecord[];
  returnStatus?: 'None' | 'Partially Returned' | 'Fully Returned';
  totalRefunded?: number;
}

interface SalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  storeId: string;
  products: Product[];
  customers: Customer[];
  allSerials: SerialNumber[];
  storeDetails: {
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
    bankAccounts?: { bankName: string; accountNumber: string; accountTitle?: string; openingBalance?: number; balance?: number }[];
    termsAndConditions?: string;
  };
  onSuccess?: () => void;
}

// Function to print a dedicated Sales Return & Refund Receipt
export const printReturnReceipt = (
  sale: Sale,
  returnRecord: SaleReturnRecord,
  storeDetails: {
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
  }
) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    toast.error('Failed to initialize print process');
    return;
  }

  const itemsRows = returnRecord.items.map(item => `
    <tr style="border-bottom: 1.5px solid #000000;">
      <td style="padding: 6px 10px; text-align: left; vertical-align: top; border-bottom: 1.5px solid #000000;">
        <div style="font-weight: bold; color: #000000; font-size: 11px;">${item.productName}</div>
        ${(item.brand || item.modelNumber || item.category) ? `
          <div style="font-size: 10px; color: #000000; margin-top: 1px; font-weight: 500;">
            ${item.brand ? item.brand + ' • ' : ''}${item.modelNumber ? item.modelNumber + ' • ' : ''}${item.category || ''}
          </div>
        ` : ''}
        ${item.returnedSerials && item.returnedSerials.length > 0 ? `
          <div style="font-size: 9.5px; color: #000000; margin-top: 2px; line-height: 1.25; word-break: break-word;">
            <span style="font-weight: bold; text-transform: uppercase; font-size: 8.5px;">Returned S/N: </span>
            <span style="font-family: monospace; font-weight: 600;">${item.returnedSerials.join(', ')}</span>
          </div>
        ` : ''}
      </td>
      <td style="padding: 6px 10px; text-align: center; font-weight: 700; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">PKR ${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 6px 10px; text-align: center; font-weight: 800; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">${item.quantity}</td>
      <td style="padding: 6px 10px; text-align: right; font-weight: 800; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">PKR ${item.refundAmount.toFixed(2)}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Return Voucher - ${returnRecord.id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Cinzel:wght@700;800;900&family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        @page {
          size: auto;
          margin: 8mm 12mm;
        }
        html, body {
          height: 100%;
          margin: 0 !important;
          padding: 0 !important;
          color: #000000;
          background-color: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 8mm 12mm;
          box-sizing: border-box;
          color: #000000;
        }
        .receipt-container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          min-height: 255mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <div>
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div style="width: 100px; flex-shrink: 0;">
              ${storeDetails.logoUrl ? `
                <img src="${storeDetails.logoUrl}" alt="Logo" style="width: 90px; height: 90px; object-fit: contain;" />
              ` : `
                <div style="width: 85px; height: 85px; background-color: #0a382c; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; border-radius: 12px;">
                  RET
                </div>
              `}
            </div>

            <div style="flex: 1; text-align: center;">
              <h1 style="font-family: 'Cinzel', 'Playfair Display', Georgia, serif; font-size: 32px; font-weight: 900; margin: 0; text-decoration: underline; text-underline-offset: 6px;">
                ${storeDetails.name || 'ElectroManage'}
              </h1>
              <div style="font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 6px; color: #581c87;">
                SALES RETURN & REFUND VOUCHER
              </div>
            </div>

            <div style="width: 100px; flex-shrink: 0;"></div>
          </div>

          <!-- Contact Details -->
          <div style="font-family: 'Carlito', Arial, sans-serif; font-size: 14px; margin-top: 2px; line-height: 1.3;">
            <div><strong>Address:</strong> ${storeDetails.address || 'Madni Chowk Pindi Gheb'}</div>
            <div><strong>Phone:</strong> ${storeDetails.phone || '0312-5653636'} | <strong>Email:</strong> ${storeDetails.email || 'smarttech5535@gmail.com'}</div>
          </div>

          <div style="width: 100%; border-bottom: 2px solid #000000; margin-top: 6px; margin-bottom: 12px;"></div>

          <!-- Meta Info -->
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 14px;">
            <div style="line-height: 1.5;">
              <div><strong>Customer:</strong> ${sale.customerName}</div>
              <div><strong>Original Invoice:</strong> ${sale.invoiceNo}</div>
              <div><strong>Original Invoice Date:</strong> ${new Date(sale.date).toLocaleDateString()}</div>
            </div>
            <div style="text-align: right; line-height: 1.5;">
              <div><strong>Return ID:</strong> <span style="font-family: monospace; font-weight: bold;">${returnRecord.id}</span></div>
              <div><strong>Return Date:</strong> ${new Date(returnRecord.returnDate).toLocaleDateString()}</div>
              <div><strong>Refund Method:</strong> ${returnRecord.refundMode}${returnRecord.bankName ? ` (${returnRecord.bankName})` : ''}</div>
              <div><strong>Inventory Restocked:</strong> ${returnRecord.restocked ? 'Yes (Returned to Stock)' : 'No (Defective / Scrapped)'}</div>
            </div>
          </div>

          <!-- Reason -->
          <div style="background-color: #f3f4f6; border-left: 3px solid #581c87; padding: 6px 10px; font-size: 11px; margin-bottom: 14px;">
            <strong>Return Reason:</strong> ${returnRecord.reason} ${returnRecord.notes ? ` — Note: ${returnRecord.notes}` : ''}
          </div>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000000; margin-bottom: 12px;">
            <thead>
              <tr style="background-color: #000000; color: #ffffff;">
                <th style="padding: 6px 10px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase;">PRODUCT RETURNED</th>
                <th style="padding: 6px 10px; text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase;">UNIT PRICE</th>
                <th style="padding: 6px 10px; text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase;">QTY RETURNED</th>
                <th style="padding: 6px 10px; text-align: right; font-size: 11px; font-weight: 800; text-transform: uppercase;">REFUND AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <!-- Totals -->
          <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
            <div style="width: 280px; text-align: right; line-height: 1.6; font-size: 13px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid #000000; padding-top: 6px; font-size: 16px; color: #000000;">
                <span>Total Amount Refunded:</span>
                <span style="font-family: monospace;">PKR ${returnRecord.totalRefund.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Signatures & Verification -->
        <div style="margin-top: 40px; padding-top: 15px; border-top: 1.5px dashed #000000;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px;">
            <div style="text-align: center; width: 160px;">
              <div style="border-bottom: 1px solid #000000; height: 35px;"></div>
              <div style="margin-top: 4px; font-weight: bold;">Customer Signature</div>
            </div>
            <div style="text-align: center; font-size: 10px; color: #4b5563;">
              Official Sales Return & Refund Confirmation<br/>
              Printed on ${new Date().toLocaleString()}
            </div>
            <div style="text-align: center; width: 160px;">
              <div style="border-bottom: 1px solid #000000; height: 35px;"></div>
              <div style="margin-top: 4px; font-weight: bold;">Authorized Store Stamp</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 350);
};

export default function SalesReturnModal({
  isOpen,
  onClose,
  sale,
  storeId,
  products,
  customers,
  allSerials,
  storeDetails,
  onSuccess
}: SalesReturnModalProps) {
  if (!isOpen || !sale) return null;

  // Track return items state
  // key: productId
  interface ItemReturnFormState {
    productId: string;
    productName: string;
    brand: string;
    modelNumber: string;
    category: string;
    originalQuantity: number;
    previouslyReturnedQuantity: number;
    maxReturnableQuantity: number;
    returnQuantity: number;
    unitPrice: number;
    unitDiscount: number;
    effectiveUnitPrice: number;
    allSoldSerials: string[];
    previouslyReturnedSerials: string[];
    availableSerials: string[];
    selectedSerials: string[];
  }

  const [returnItems, setReturnItems] = useState<ItemReturnFormState[]>([]);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [returnReason, setReturnReason] = useState('Customer Changed Mind');
  const [returnNotes, setReturnNotes] = useState('');
  const [refundMode, setRefundMode] = useState<'Cash' | 'Online' | 'Customer Credit'>('Cash');
  const [selectedBankAccNumber, setSelectedBankAccNumber] = useState('');
  const [restockToInventory, setRestockToInventory] = useState(true);
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [isCustomRefund, setIsCustomRefund] = useState(false);
  const [printVoucherOnSubmit, setPrintVoucherOnSubmit] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Initialize return items when modal opens
  useEffect(() => {
    if (!sale || !sale.items) return;

    // Collate items and previous returns
    const previouslyReturnedSerialsSet = new Set<string>();
    const previouslyReturnedQtyMap: Record<string, number> = {};

    if (sale.returns && sale.returns.length > 0) {
      sale.returns.forEach(ret => {
        ret.items.forEach(it => {
          previouslyReturnedQtyMap[it.productId] = (previouslyReturnedQtyMap[it.productId] || 0) + it.quantity;
          if (it.returnedSerials) {
            it.returnedSerials.forEach(sn => previouslyReturnedSerialsSet.add(sn));
          }
        });
      });
    }

    const itemsState: ItemReturnFormState[] = (sale.items || []).map(item => {
      const prevReturnedQty = (item.returnedQuantity || previouslyReturnedQtyMap[item.productId] || 0);
      const maxReturnable = Math.max(0, item.quantity - prevReturnedQty);
      
      const allSoldSerials = item.selectedSerials || [];
      const itemPrevReturnedSerials = (item.returnedSerials || []).concat(
        allSoldSerials.filter(sn => previouslyReturnedSerialsSet.has(sn))
      );
      const uniquePrevReturnedSerials = Array.from(new Set(itemPrevReturnedSerials));
      const availableSerials = allSoldSerials.filter(sn => !uniquePrevReturnedSerials.includes(sn));

      // Calculate effective unit price taking discount into account
      const effectiveUnitPrice = item.quantity > 0 
        ? Math.max(0, (item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))) / item.quantity)
        : item.salePrice;

      return {
        productId: item.productId,
        productName: item.productName,
        brand: item.brand,
        modelNumber: item.modelNumber,
        category: item.category,
        originalQuantity: item.quantity,
        previouslyReturnedQuantity: prevReturnedQty,
        maxReturnableQuantity: maxReturnable,
        returnQuantity: 0,
        unitPrice: item.salePrice,
        unitDiscount: item.quantity > 0 ? (item.discount || 0) / item.quantity : 0,
        effectiveUnitPrice,
        allSoldSerials,
        previouslyReturnedSerials: uniquePrevReturnedSerials,
        availableSerials,
        selectedSerials: []
      };
    });

    setReturnItems(itemsState);
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnReason('Customer Changed Mind');
    setReturnNotes('');
    setRefundMode('Cash');
    setSelectedBankAccNumber(storeDetails.bankAccounts?.[0]?.accountNumber || '');
    setRestockToInventory(true);
    setIsCustomRefund(false);
    setCustomRefundAmount('');
  }, [sale, isOpen, storeDetails]);

  // Calculate total automatically based on returned quantities and effective prices
  const calculatedRefundTotal = useMemo(() => {
    return returnItems.reduce((sum, item) => {
      return sum + (item.returnQuantity * item.effectiveUnitPrice);
    }, 0);
  }, [returnItems]);

  const activeRefundAmount = isCustomRefund && customRefundAmount !== ''
    ? Math.max(0, parseFloat(customRefundAmount) || 0)
    : calculatedRefundTotal;

  const totalReturnableItemsRemaining = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + item.maxReturnableQuantity, 0);
  }, [returnItems]);

  const totalUnitsSelectedForReturn = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + item.returnQuantity, 0);
  }, [returnItems]);

  // Handle return quantity change for a product
  const handleQuantityChange = (productId: string, newQty: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;

      const clamped = Math.max(0, Math.min(newQty, item.maxReturnableQuantity));

      // If serials are tracked for this item, adjust selectedSerials
      let updatedSelectedSerials = [...item.selectedSerials];
      if (item.availableSerials.length > 0) {
        if (clamped < updatedSelectedSerials.length) {
          updatedSelectedSerials = updatedSelectedSerials.slice(0, clamped);
        } else if (clamped > updatedSelectedSerials.length) {
          const unselected = item.availableSerials.filter(sn => !updatedSelectedSerials.includes(sn));
          const toAdd = unselected.slice(0, clamped - updatedSelectedSerials.length);
          updatedSelectedSerials = [...updatedSelectedSerials, ...toAdd];
        }
      }

      return {
        ...item,
        returnQuantity: clamped,
        selectedSerials: updatedSelectedSerials
      };
    }));
  };

  // Toggle specific serial number for return
  const handleToggleSerial = (productId: string, serialNumber: string) => {
    setReturnItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;

      const isSelected = item.selectedSerials.includes(serialNumber);
      let updatedSerials: string[];

      if (isSelected) {
        updatedSerials = item.selectedSerials.filter(s => s !== serialNumber);
      } else {
        if (item.selectedSerials.length >= item.maxReturnableQuantity) {
          toast.warning(`Cannot select more serials than remaining returnable quantity (${item.maxReturnableQuantity})`);
          return item;
        }
        updatedSerials = [...item.selectedSerials, serialNumber];
      }

      return {
        ...item,
        selectedSerials: updatedSerials,
        returnQuantity: updatedSerials.length
      };
    }));
  };

  // Quick helper to select all returnable for an item
  const handleSelectAllForItem = (productId: string) => {
    setReturnItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      return {
        ...item,
        returnQuantity: item.maxReturnableQuantity,
        selectedSerials: [...item.availableSerials]
      };
    }));
  };

  // Submit return
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !sale) return;

    if (totalUnitsSelectedForReturn <= 0) {
      toast.error('Please select at least one item quantity to return');
      return;
    }

    // Validation for serials
    for (const item of returnItems) {
      if (item.returnQuantity > 0 && item.availableSerials.length > 0) {
        if (item.selectedSerials.length !== item.returnQuantity) {
          toast.error(`Please select exactly ${item.returnQuantity} serial number(s) to return for "${item.productName}"`);
          return;
        }
      }
    }

    // Validation for online refund
    if (refundMode === 'Online') {
      if (!selectedBankAccNumber) {
        toast.error('Please select a store bank account to process the online refund');
        return;
      }
      const matched = storeDetails.bankAccounts?.find(b => b.accountNumber === selectedBankAccNumber);
      if (!matched) {
        toast.error('Selected store bank account not found');
        return;
      }
    }

    // Customer credit validation
    if (refundMode === 'Customer Credit') {
      if (!sale.customerId || sale.customerId === 'walk-in') {
        toast.error('Cannot apply customer credit to Walk In customer. Please select Cash or Online refund.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const returnId = `RET-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

      // Prepare items for this return
      const returnedItemsList: ReturnItemRecord[] = [];
      const updatedSaleItems: SaleItem[] = (sale.items || []).map(originalItem => {
        const matchingReturn = returnItems.find(r => r.productId === originalItem.productId);
        if (!matchingReturn || matchingReturn.returnQuantity <= 0) {
          return originalItem;
        }

        const currentReturnedQty = originalItem.returnedQuantity || 0;
        const newReturnedQty = currentReturnedQty + matchingReturn.returnQuantity;
        const currentReturnedSerials = originalItem.returnedSerials || [];
        const newReturnedSerials = Array.from(new Set([...currentReturnedSerials, ...matchingReturn.selectedSerials]));

        const refundAmountForItem = Number((matchingReturn.returnQuantity * matchingReturn.effectiveUnitPrice).toFixed(2));

        returnedItemsList.push({
          productId: matchingReturn.productId,
          productName: matchingReturn.productName,
          brand: matchingReturn.brand,
          modelNumber: matchingReturn.modelNumber,
          category: matchingReturn.category,
          quantity: matchingReturn.returnQuantity,
          unitPrice: matchingReturn.unitPrice,
          refundAmount: refundAmountForItem,
          returnedSerials: matchingReturn.selectedSerials
        });

        return {
          ...originalItem,
          returnedQuantity: newReturnedQty,
          returnedSerials: newReturnedSerials
        };
      });

      // 1. If restockToInventory is true: update product stock, create inventoryLogs, and update serials to Available
      if (restockToInventory) {
        for (const item of returnItems) {
          if (item.returnQuantity <= 0) continue;

          const prod = products.find(p => p.id === item.productId);
          const currentStock = prod ? (prod.stock || 0) : 0;
          const newStock = currentStock + item.returnQuantity;

          // Update product stock
          const prodRef = doc(db, 'products', item.productId);
          batch.update(prodRef, {
            stock: newStock,
            updatedAt: serverTimestamp()
          });

          // Create inventory log entry
          const logRef = doc(collection(db, 'inventoryLogs'));
          batch.set(logRef, {
            storeId,
            productId: item.productId,
            productName: item.productName,
            productBrand: item.brand,
            productModelNumber: item.modelNumber,
            quantityAdded: item.returnQuantity,
            previousStock: currentStock,
            newStock,
            referenceNumber: `RET-${sale.invoiceNo}`,
            notes: `Sales Return from Invoice ${sale.invoiceNo} (${returnReason}${returnNotes ? ': ' + returnNotes : ''})`,
            createdAt: serverTimestamp()
          });

          // Revert returned serial numbers back to 'Available'
          for (const sn of item.selectedSerials) {
            const matchedSerial = allSerials.find(s => s.serialNumber === sn && s.productId === item.productId)
              || allSerials.find(s => s.serialNumber === sn);
            
            if (matchedSerial) {
              const serialRef = doc(db, 'serialNumbers', matchedSerial.id);
              batch.update(serialRef, {
                status: 'Available',
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      }

      // 2. Process Bank Balance deduction if refund mode is Online
      let matchedBank = null;
      if (refundMode === 'Online' && selectedBankAccNumber) {
        matchedBank = storeDetails.bankAccounts?.find(b => b.accountNumber === selectedBankAccNumber);
        try {
          const storeRef = doc(db, 'stores', storeId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            currentAccounts = currentAccounts.map((acc: any) => {
              const opBal = typeof acc.openingBalance === 'number' ? acc.openingBalance : (parseFloat(acc.openingBalance) || 0);
              const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || opBal);
              if (acc.accountNumber === selectedBankAccNumber) {
                return {
                  ...acc,
                  balance: Number((curBal - activeRefundAmount).toFixed(2))
                };
              }
              return {
                ...acc,
                balance: curBal
              };
            });
            batch.update(storeRef, {
              bankAccounts: currentAccounts,
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.warn('Could not update store bank account on return:', err);
        }
      }

      // 3. Process Customer Credit if refund mode is Customer Credit
      if (refundMode === 'Customer Credit' && sale.customerId) {
        try {
          const custRef = doc(db, 'customers', sale.customerId);
          const custSnap = await getDoc(custRef);
          if (custSnap.exists()) {
            const custData = custSnap.data();
            const curBal = typeof custData.balance === 'number' ? custData.balance : (parseFloat(custData.balance) || 0);
            // Deduct from outstanding balance (or increase store credit)
            batch.update(custRef, {
              balance: Number((curBal - activeRefundAmount).toFixed(2)),
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.warn('Could not update customer balance on return:', err);
        }
      }

      // 4. Create the return record
      const returnRecord: SaleReturnRecord = {
        id: returnId,
        returnDate,
        items: returnedItemsList,
        totalRefund: activeRefundAmount,
        refundMode,
        bankAccountNumber: refundMode === 'Online' && matchedBank ? matchedBank.accountNumber : null,
        bankName: refundMode === 'Online' && matchedBank ? matchedBank.bankName : null,
        reason: returnReason,
        notes: returnNotes.trim() || undefined,
        restocked: restockToInventory,
        createdAt: new Date().toISOString()
      };

      // Check if all items in the invoice are now fully returned
      const totalOriginalQty = (sale.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
      const totalNewReturnedQty = updatedSaleItems.reduce((sum, it) => sum + (it.returnedQuantity || 0), 0);
      const isFullyReturned = totalNewReturnedQty >= totalOriginalQty;

      const previousRefunds = sale.totalRefunded || 0;
      const newTotalRefunded = Number((previousRefunds + activeRefundAmount).toFixed(2));

      // 5. Update Sale document
      const saleRef = doc(db, 'sales', sale.id);
      batch.update(saleRef, {
        items: updatedSaleItems,
        returns: [...(sale.returns || []), returnRecord],
        returnStatus: isFullyReturned ? 'Fully Returned' : 'Partially Returned',
        totalRefunded: newTotalRefunded,
        status: isFullyReturned ? 'Returned' : sale.status,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      toast.success(`Successfully processed return of ${totalUnitsSelectedForReturn} item(s) for Invoice ${sale.invoiceNo}!`);

      if (printVoucherOnSubmit) {
        printReturnReceipt(sale, returnRecord, storeDetails);
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Error processing sales return:', error);
      toast.error('Failed to process sales return. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-slate-200">
          {/* Header */}
          <div className="bg-[#581c87] px-6 py-4 text-white flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-800/80 border border-purple-400/30">
                <RotateCcw className="w-5 h-5 text-purple-200" />
              </div>
              <div>
                <h3 className="font-extrabold text-base tracking-wide flex items-center gap-2">
                  <span>Process Sales Return</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-purple-900/80 border border-purple-400/30 text-purple-200 font-mono">
                    {sale.invoiceNo}
                  </span>
                </h3>
                <p className="text-xs text-purple-200 mt-0.5">
                  Customer: <strong>{sale.customerName}</strong> • Date: {new Date(sale.date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="text-purple-200 hover:text-white p-1.5 rounded-lg hover:bg-purple-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitReturn}>
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Previous Returns Notice (if any) */}
              {sale.returns && sale.returns.length > 0 && (
                <div className="p-3.5 bg-purple-50/70 border border-purple-150 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-purple-900 font-semibold">
                    <AlertCircle className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>
                      This invoice already has <strong>{sale.returns.length}</strong> previous return voucher(s). Total refunded so far: <strong>PKR {(sale.totalRefunded || 0).toFixed(2)}</strong>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-200/80 text-purple-800">
                    {sale.returnStatus || 'Partially Returned'}
                  </span>
                </div>
              )}

              {/* All Items Returned Guard */}
              {totalReturnableItemsRemaining <= 0 ? (
                <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">All Items Have Been Returned</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Every product purchased in Invoice {sale.invoiceNo} has already been 100% returned and refunded. No additional items remain returnable.
                  </p>
                </div>
              ) : (
                <>
                  {/* Itemized Return Selection Table */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                          Select Items & Quantities to Return
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Choose the quantity and specific serial numbers (if applicable) being returned by the customer.
                        </p>
                      </div>
                      <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                        {totalUnitsSelectedForReturn} of {totalReturnableItemsRemaining} units selected
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-bold text-slate-600 uppercase tracking-wider text-[10px]">Product / Model</th>
                            <th className="px-3 py-2.5 text-center font-bold text-slate-600 uppercase tracking-wider text-[10px]">Purchased</th>
                            <th className="px-3 py-2.5 text-center font-bold text-slate-600 uppercase tracking-wider text-[10px]">Already Returned</th>
                            <th className="px-3 py-2.5 text-center font-bold text-slate-600 uppercase tracking-wider text-[10px]">Returnable</th>
                            <th className="px-4 py-2.5 text-center font-bold text-slate-600 uppercase tracking-wider text-[10px]">Return Quantity</th>
                            <th className="px-4 py-2.5 text-right font-bold text-slate-600 uppercase tracking-wider text-[10px]">Item Refund</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {returnItems.map(item => {
                            const isReturnable = item.maxReturnableQuantity > 0;
                            const itemRefund = Number((item.returnQuantity * item.effectiveUnitPrice).toFixed(2));

                            return (
                              <React.Fragment key={item.productId}>
                                <tr className={`hover:bg-slate-50/80 transition-colors ${item.returnQuantity > 0 ? 'bg-purple-50/30' : ''}`}>
                                  <td className="px-4 py-3 align-top">
                                    <div className="font-bold text-slate-900">{item.productName}</div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                      {item.brand ? `${item.brand} • ` : ''}{item.modelNumber || ''} {item.category ? `(${item.category})` : ''}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                      Sale Price: PKR {item.unitPrice.toFixed(2)} 
                                      {item.unitDiscount > 0 && ` (Disc: -PKR ${item.unitDiscount.toFixed(2)})`}
                                    </div>
                                  </td>

                                  <td className="px-3 py-3 text-center align-top font-semibold text-slate-700">
                                    {item.originalQuantity}
                                  </td>

                                  <td className="px-3 py-3 text-center align-top font-semibold text-slate-400">
                                    {item.previouslyReturnedQuantity}
                                  </td>

                                  <td className="px-3 py-3 text-center align-top font-bold text-emerald-700">
                                    {item.maxReturnableQuantity}
                                  </td>

                                  <td className="px-4 py-3 align-top">
                                    {isReturnable ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleQuantityChange(item.productId, item.returnQuantity - 1)}
                                          disabled={item.returnQuantity <= 0}
                                          className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                          title="Decrease quantity"
                                        >
                                          <Minus className="w-3.5 h-3.5 text-slate-600" />
                                        </button>

                                        <input
                                          type="number"
                                          min={0}
                                          max={item.maxReturnableQuantity}
                                          value={item.returnQuantity}
                                          onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 0)}
                                          className="w-14 text-center py-1 px-1.5 font-bold rounded-lg border border-slate-300 text-slate-900 focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                                        />

                                        <button
                                          type="button"
                                          onClick={() => handleQuantityChange(item.productId, item.returnQuantity + 1)}
                                          disabled={item.returnQuantity >= item.maxReturnableQuantity}
                                          className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                          title="Increase quantity"
                                        >
                                          <Plus className="w-3.5 h-3.5 text-slate-600" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleSelectAllForItem(item.productId)}
                                          className="text-[10px] px-1.5 py-1 rounded bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-900 font-bold ml-1 transition-colors cursor-pointer"
                                          title="Return all remaining quantity"
                                        >
                                          All
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic block text-center">
                                        Fully Returned
                                      </span>
                                    )}
                                  </td>

                                  <td className="px-4 py-3 text-right align-top font-bold font-mono text-slate-900">
                                    PKR {itemRefund.toFixed(2)}
                                  </td>
                                </tr>

                                {/* Serial Numbers Selection Row if product was sold with serial numbers */}
                                {item.availableSerials.length > 0 && isReturnable && (
                                  <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <td colSpan={6} className="px-4 py-2 text-xs">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                          <Hash className="w-3 h-3 text-purple-600" /> Select Serials to Return ({item.selectedSerials.length}/{item.returnQuantity}):
                                        </span>
                                        {item.availableSerials.map(sn => {
                                          const isSelected = item.selectedSerials.includes(sn);
                                          return (
                                            <button
                                              key={sn}
                                              type="button"
                                              onClick={() => handleToggleSerial(item.productId, sn)}
                                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer ${
                                                isSelected 
                                                  ? 'bg-purple-700 text-white shadow-2xs' 
                                                  : 'bg-white border border-slate-300 text-slate-700 hover:border-purple-400'
                                              }`}
                                            >
                                              {isSelected && <Check className="w-3 h-3" />}
                                              <span>{sn}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Return Details & Reason Configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Return Date <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                          required
                          className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Reason for Return <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        required
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                      >
                        <option value="Customer Changed Mind">Customer Changed Mind</option>
                        <option value="Defective / Warranty Issue">Defective / Warranty Issue</option>
                        <option value="Wrong Product / Specifications">Wrong Product / Specifications</option>
                        <option value="Damaged / Scratched">Damaged / Scratched</option>
                        <option value="Exchange Requested">Exchange Requested</option>
                        <option value="Other">Other Reason</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Additional Notes / Remarks (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Serial checked, packaging intact, replacement promised..."
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Refund Payment & Restock Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Refund Payment Method <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setRefundMode('Cash')}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            refundMode === 'Cash'
                              ? 'bg-[#0a382c] text-white border-[#0a382c] shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          <span>Cash</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRefundMode('Online')}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            refundMode === 'Online'
                              ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Bank/Online</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRefundMode('Customer Credit')}
                          disabled={!sale.customerId || sale.customerId === 'walk-in'}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                            refundMode === 'Customer Credit'
                              ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                          title={!sale.customerId || sale.customerId === 'walk-in' ? 'Available only for registered customers' : 'Credit to customer account'}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Credit</span>
                        </button>
                      </div>

                      {/* Store Bank Account Select if Online */}
                      {refundMode === 'Online' && (
                        <div className="mt-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Deduct Refund From Store Bank Account:
                          </label>
                          <select
                            value={selectedBankAccNumber}
                            onChange={(e) => setSelectedBankAccNumber(e.target.value)}
                            required
                            className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                          >
                            <option value="">-- Select Bank Account --</option>
                            {storeDetails.bankAccounts?.map((acc, idx) => (
                              <option key={idx} value={acc.accountNumber}>
                                {acc.bankName} - {acc.accountNumber} {acc.accountTitle ? `(${acc.accountTitle})` : ''} [Bal: PKR {(acc.balance || 0).toLocaleString()}]
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Inventory Action
                      </label>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="restockInventory"
                          checked={restockToInventory}
                          onChange={(e) => setRestockToInventory(e.target.checked)}
                          className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4"
                        />
                        <label htmlFor="restockInventory" className="text-xs text-slate-700 cursor-pointer">
                          <span className="font-bold text-slate-900 block">Restock items back into inventory</span>
                          <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                            Increases product warehouse stock count and marks returned serial numbers as Available for resale.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Refund Total Summary Bar */}
                  <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">
                        Calculated Refund Amount
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-purple-950 font-mono">
                          PKR {activeRefundAmount.toFixed(2)}
                        </span>
                        {isCustomRefund && (
                          <span className="text-xs text-amber-700 font-bold">(Custom Override)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Original Invoice Total: PKR {sale.total?.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                      {!isCustomRefund ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomRefund(true);
                            setCustomRefundAmount(calculatedRefundTotal.toFixed(2));
                          }}
                          className="text-xs text-purple-800 hover:text-purple-950 underline font-semibold cursor-pointer"
                        >
                          Adjust Refund Amount
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 font-bold">Custom:</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={customRefundAmount}
                            onChange={(e) => setCustomRefundAmount(e.target.value)}
                            className="w-28 py-1.5 px-2 rounded-lg border border-purple-300 font-mono text-xs font-bold text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomRefund(false);
                              setCustomRefundAmount('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 pl-3 border-l border-purple-200 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          id="printVoucher"
                          checked={printVoucherOnSubmit}
                          onChange={(e) => setPrintVoucherOnSubmit(e.target.checked)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <label htmlFor="printVoucher" className="font-semibold cursor-pointer flex items-center gap-1">
                          <Printer className="w-3.5 h-3.5 text-purple-700" />
                          Print Voucher
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-[#f8faf9] px-6 py-4 flex justify-between items-center border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting || totalUnitsSelectedForReturn <= 0 || totalReturnableItemsRemaining <= 0}
                  className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-extrabold shadow-md shadow-purple-900/10 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RotateCcw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                  <span>{submitting ? 'Processing Return...' : `Confirm Return (${totalUnitsSelectedForReturn} units)`}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
