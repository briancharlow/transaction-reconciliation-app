import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Download, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';

const ReconciliationTool = () => {
  const [internalFile, setInternalFile] = useState(null);
  const [providerFile, setProviderFile] = useState(null);
  const [internalData, setInternalData] = useState([]);
  const [providerData, setProviderData] = useState([]);
  const [reconciliationResults, setReconciliationResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadErrors, setUploadErrors] = useState({ internal: null, provider: null });

  // File upload handler
  const handleFileUpload = (file, type) => {
    if (!file) return;
    
    setUploadErrors(prev => ({ ...prev, [type]: null }));
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (results) => {
        if (results.errors.length > 0) {
          setUploadErrors(prev => ({ 
            ...prev, 
            [type]: `CSV parsing error: ${results.errors[0].message}` 
          }));
          return;
        }

        // Validate required columns
        const requiredColumns = ['transaction_reference'];
        const headers = results.meta.fields || [];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
          setUploadErrors(prev => ({ 
            ...prev, 
            [type]: `Missing required columns: ${missingColumns.join(', ')}` 
          }));
          return;
        }

        const processedData = results.data.map(row => ({
          ...row,
          // Ensure transaction_reference is a string for consistent comparison
          transaction_reference: String(row.transaction_reference || '').trim(),
          // Parse amounts as numbers if they exist
          amount: row.amount ? parseFloat(row.amount) : null,
          // Normalize status if it exists
          status: row.status ? String(row.status).toLowerCase().trim() : null
        })).filter(row => row.transaction_reference); // Remove rows without transaction reference

        if (type === 'internal') {
          setInternalData(processedData);
          setInternalFile(file);
        } else {
          setProviderData(processedData);
          setProviderFile(file);
        }
      },
      error: (error) => {
        setUploadErrors(prev => ({ 
          ...prev, 
          [type]: `File reading error: ${error.message}` 
        }));
      }
    });
  };

  // Reconciliation logic
  const performReconciliation = () => {
    if (!internalData.length || !providerData.length) return;
    
    setIsProcessing(true);
    
    // Create maps for efficient lookup
    const internalMap = new Map();
    const providerMap = new Map();
    
    internalData.forEach(record => {
      internalMap.set(record.transaction_reference, record);
    });
    
    providerData.forEach(record => {
      providerMap.set(record.transaction_reference, record);
    });
    
    const matched = [];
    const internalOnly = [];
    const providerOnly = [];
    const amountMismatches = [];
    const statusMismatches = [];
    
    // Check internal records
    internalData.forEach(internalRecord => {
      const ref = internalRecord.transaction_reference;
      const providerRecord = providerMap.get(ref);
      
      if (providerRecord) {
        // Found match - check for discrepancies
        const matchResult = {
          transaction_reference: ref,
          internal: internalRecord,
          provider: providerRecord,
          amountMatch: true,
          statusMatch: true
        };
        
        // Check amount mismatch
        if (internalRecord.amount !== null && providerRecord.amount !== null) {
          const amountDiff = Math.abs(internalRecord.amount - providerRecord.amount);
          if (amountDiff > 0.01) { // Allow for small floating point differences
            matchResult.amountMatch = false;
            amountMismatches.push(matchResult);
          }
        }
        
        // Check status mismatch
        if (internalRecord.status && providerRecord.status) {
          if (internalRecord.status !== providerRecord.status) {
            matchResult.statusMatch = false;
            statusMismatches.push(matchResult);
          }
        }
        
        matched.push(matchResult);
      } else {
        // Only in internal
        internalOnly.push(internalRecord);
      }
    });
    
    // Check provider records not in internal
    providerData.forEach(providerRecord => {
      const ref = providerRecord.transaction_reference;
      if (!internalMap.has(ref)) {
        providerOnly.push(providerRecord);
      }
    });
    
    setReconciliationResults({
      matched,
      internalOnly,
      providerOnly,
      amountMismatches,
      statusMismatches,
      summary: {
        totalInternal: internalData.length,
        totalProvider: providerData.length,
        matchedCount: matched.length,
        internalOnlyCount: internalOnly.length,
        providerOnlyCount: providerOnly.length,
        amountMismatchCount: amountMismatches.length,
        statusMismatchCount: statusMismatches.length
      }
    });
    
    setIsProcessing(false);
  };

  // Export to CSV
  const exportToCSV = (data, filename, type) => {
    let csvData;
    
    if (type === 'matched') {
      csvData = data.map(item => ({
        transaction_reference: item.transaction_reference,
        internal_amount: item.internal.amount || '',
        provider_amount: item.provider.amount || '',
        internal_status: item.internal.status || '',
        provider_status: item.provider.status || '',
        amount_match: item.amountMatch ? 'Yes' : 'No',
        status_match: item.statusMatch ? 'Yes' : 'No'
      }));
    } else {
      csvData = data;
    }
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset function
  const resetReconciliation = () => {
    setInternalFile(null);
    setProviderFile(null);
    setInternalData([]);
    setProviderData([]);
    setReconciliationResults(null);
    setUploadErrors({ internal: null, provider: null });
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mini Reconciliation Tool</h1>
          <p className="text-gray-600">Compare internal transactions with payment processor statements to identify discrepancies</p>
        </div>

        {/* File Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Internal System Upload */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="mr-2 text-blue-600" size={20} />
              Internal System Export
            </h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e.target.files[0], 'internal')}
                className="hidden"
                id="internal-upload"
              />
              <label htmlFor="internal-upload" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-gray-600">Click to upload CSV file</p>
                <p className="text-sm text-gray-500 mt-1">Must contain: transaction_reference</p>
              </label>
            </div>
            {internalFile && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                <p className="text-sm text-green-800">✓ {internalFile.name} ({internalData.length} records)</p>
              </div>
            )}
            {uploadErrors.internal && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-800">{uploadErrors.internal}</p>
              </div>
            )}
          </div>

          {/* Provider Statement Upload */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="mr-2 text-purple-600" size={20} />
              Provider Statement
            </h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e.target.files[0], 'provider')}
                className="hidden"
                id="provider-upload"
              />
              <label htmlFor="provider-upload" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-gray-600">Click to upload CSV file</p>
                <p className="text-sm text-gray-500 mt-1">Must contain: transaction_reference</p>
              </label>
            </div>
            {providerFile && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                <p className="text-sm text-green-800">✓ {providerFile.name} ({providerData.length} records)</p>
              </div>
            )}
            {uploadErrors.provider && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-800">{uploadErrors.provider}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={performReconciliation}
            disabled={!internalData.length || !providerData.length || isProcessing}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle size={20} />}
            <span>{isProcessing ? 'Processing...' : 'Start Reconciliation'}</span>
          </button>
          <button
            onClick={resetReconciliation}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center space-x-2"
          >
            <RefreshCw size={20} />
            <span>Reset</span>
          </button>
        </div>

        {/* Results Section */}
        {reconciliationResults && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center">
                  <CheckCircle className="text-green-600 mr-2" size={20} />
                  <div>
                    <p className="text-sm text-green-600 font-medium">Matched</p>
                    <p className="text-2xl font-bold text-green-900">{reconciliationResults.summary.matchedCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="flex items-center">
                  <AlertTriangle className="text-yellow-600 mr-2" size={20} />
                  <div>
                    <p className="text-sm text-yellow-600 font-medium">Internal Only</p>
                    <p className="text-2xl font-bold text-yellow-900">{reconciliationResults.summary.internalOnlyCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-center">
                  <XCircle className="text-red-600 mr-2" size={20} />
                  <div>
                    <p className="text-sm text-red-600 font-medium">Provider Only</p>
                    <p className="text-2xl font-bold text-red-900">{reconciliationResults.summary.providerOnlyCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center">
                  <AlertTriangle className="text-blue-600 mr-2" size={20} />
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Mismatches</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {reconciliationResults.summary.amountMismatchCount + reconciliationResults.summary.statusMismatchCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Matched Transactions */}
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b border-gray-200 bg-green-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-900 flex items-center">
                      <CheckCircle className="mr-2" size={18} />
                      Matched Transactions ({reconciliationResults.matched.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.matched, 'matched_transactions.csv', 'matched')}
                      className="text-green-600 hover:text-green-800"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  {reconciliationResults.matched.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No matched transactions</p>
                  ) : (
                    <div className="space-y-2">
                      {reconciliationResults.matched.map((match, index) => (
                        <div key={index} className={`p-3 rounded border ${
                          !match.amountMatch || !match.statusMatch 
                            ? 'border-yellow-300 bg-yellow-50' 
                            : 'border-gray-200 bg-gray-50'
                        }`}>
                          <div className="font-mono text-sm font-medium text-gray-900 mb-1">
                            {match.transaction_reference}
                          </div>
                          {(!match.amountMatch || !match.statusMatch) && (
                            <div className="text-xs space-y-1">
                              {!match.amountMatch && (
                                <div className="text-yellow-700">
                                  ⚠️ Amount: {formatCurrency(match.internal.amount)} vs {formatCurrency(match.provider.amount)}
                                </div>
                              )}
                              {!match.statusMatch && (
                                <div className="text-yellow-700">
                                  ⚠️ Status: {match.internal.status} vs {match.provider.status}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Internal Only */}
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b border-gray-200 bg-yellow-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-yellow-900 flex items-center">
                      <AlertTriangle className="mr-2" size={18} />
                      Internal Only ({reconciliationResults.internalOnly.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.internalOnly, 'internal_only_transactions.csv')}
                      className="text-yellow-600 hover:text-yellow-800"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  {reconciliationResults.internalOnly.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No internal-only transactions</p>
                  ) : (
                    <div className="space-y-2">
                      {reconciliationResults.internalOnly.map((record, index) => (
                        <div key={index} className="p-3 rounded border border-gray-200 bg-gray-50">
                          <div className="font-mono text-sm font-medium text-gray-900 mb-1">
                            {record.transaction_reference}
                          </div>
                          <div className="text-xs text-gray-600">
                            {record.amount && <span>Amount: {formatCurrency(record.amount)}</span>}
                            {record.status && <span className="ml-3">Status: {record.status}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Provider Only */}
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b border-gray-200 bg-red-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-red-900 flex items-center">
                      <XCircle className="mr-2" size={18} />
                      Provider Only ({reconciliationResults.providerOnly.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.providerOnly, 'provider_only_transactions.csv')}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  {reconciliationResults.providerOnly.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No provider-only transactions</p>
                  ) : (
                    <div className="space-y-2">
                      {reconciliationResults.providerOnly.map((record, index) => (
                        <div key={index} className="p-3 rounded border border-gray-200 bg-gray-50">
                          <div className="font-mono text-sm font-medium text-gray-900 mb-1">
                            {record.transaction_reference}
                          </div>
                          <div className="text-xs text-gray-600">
                            {record.amount && <span>Amount: {formatCurrency(record.amount)}</span>}
                            {record.status && <span className="ml-3">Status: {record.status}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reconciliation Summary */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">File Statistics</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Internal Records:</span> {reconciliationResults.summary.totalInternal}</p>
                    <p><span className="font-medium">Provider Records:</span> {reconciliationResults.summary.totalProvider}</p>
                    <p><span className="font-medium">Match Rate:</span> {
                      Math.round((reconciliationResults.summary.matchedCount / Math.max(reconciliationResults.summary.totalInternal, reconciliationResults.summary.totalProvider)) * 100)
                    }%</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Discrepancy Details</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Amount Mismatches:</span> {reconciliationResults.summary.amountMismatchCount}</p>
                    <p><span className="font-medium">Status Mismatches:</span> {reconciliationResults.summary.statusMismatchCount}</p>
                    <p><span className="font-medium">Total Issues:</span> {
                      reconciliationResults.summary.internalOnlyCount + 
                      reconciliationResults.summary.providerOnlyCount + 
                      reconciliationResults.summary.amountMismatchCount + 
                      reconciliationResults.summary.statusMismatchCount
                    }</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!reconciliationResults && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
            <h3 className="font-semibold text-blue-900 mb-2">How to Use</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>1. Upload your Internal System Export CSV file (must contain 'transaction_reference' column)</p>
              <p>2. Upload your Payment Processor Statement CSV file (must contain 'transaction_reference' column)</p>
              <p>3. Click "Start Reconciliation" to compare the files</p>
              <p>4. Review results and export discrepancies for further investigation</p>
              <p className="mt-2 font-medium">Optional columns: amount, status (for enhanced mismatch detection)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReconciliationTool;