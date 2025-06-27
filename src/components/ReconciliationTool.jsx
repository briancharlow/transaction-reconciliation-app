import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Download, RefreshCw, BarChart3 } from 'lucide-react';
import Papa from 'papaparse';

const ReconciliationTool = () => {
  const [internalFile, setInternalFile] = useState(null);
  const [providerFile, setProviderFile] = useState(null);
  const [internalData, setInternalData] = useState([]);
  const [providerData, setProviderData] = useState([]);
  const [reconciliationResults, setReconciliationResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResults, setShowResults] = useState(false);
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
         
          transaction_reference: String(row.transaction_reference || '').trim(),
          amount: row.amount ? parseFloat(row.amount) : null,
          status: row.status ? String(row.status).toLowerCase().trim() : null
        })).filter(row => row.transaction_reference); 

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


  const performReconciliation = () => {
    if (!internalData.length || !providerData.length) return;
    
    setIsProcessing(true);
    setShowResults(false);
    
    // Simulate processing time with a delay
    setTimeout(() => {
      // Perform the actual reconciliation
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
            if (amountDiff > 0.01) { 
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
      
      // Show results with a slight delay for smooth animation
      setTimeout(() => {
        setShowResults(true);
      }, 300);
    }, 2000); // 2 second processing delay
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
    setShowResults(false);
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
    <div className="min-h-screen bg-white">
      {/* Hero Section - Separate Component Style */}
      <div className="bg-gradient-to-br from-gray-50 via-white to-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-3xl mb-6 shadow-lg">
              <BarChart3 className="text-blue-700" size={36} />
            </div>
            <div className="mb-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent mb-2">
                ReconFlow
              </h1>
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 rounded-full">
                <span className="text-sm font-semibold text-blue-700">✨ Smart Reconciliation Made Simple</span>
              </div>
            </div>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6">
              Transform your financial reconciliation process with intelligent CSV comparison. 
              Spot discrepancies instantly and keep your books perfectly balanced.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-8 text-sm text-gray-500">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                Lightning Fast Processing
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse" style={{animationDelay: '0.5s'}}></div>
                Zero Setup Required
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-purple-400 rounded-full mr-2 animate-pulse" style={{animationDelay: '1s'}}></div>
                Export Ready Results
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* File Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-8 sm:mb-12">
          {/* Internal System Upload */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
              <h3 className="text-lg sm:text-xl font-semibold text-blue-900 flex items-center">
                <div className="w-10 h-10 bg-blue-200 rounded-xl flex items-center justify-center mr-3">
                  <FileText className="text-blue-700" size={20} />
                </div>
                Internal System Export
              </h3>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 hover:bg-blue-50 transition-all duration-200">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload(e.target.files[0], 'internal')}
                  className="hidden"
                  id="internal-upload"
                />
                <label htmlFor="internal-upload" className="cursor-pointer">
                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Upload className="text-blue-600" size={28} />
                  </div>
                  <p className="text-gray-700 font-medium mb-2">Click to upload CSV file</p>
                  <p className="text-sm text-gray-500">Must contain: transaction_reference</p>
                </label>
              </div>
              {internalFile && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center mr-3">
                      <CheckCircle className="text-green-700" size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">{internalFile.name}</p>
                      <p className="text-xs text-green-600">{internalData.length} records loaded</p>
                    </div>
                  </div>
                </div>
              )}
              {uploadErrors.internal && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-red-200 rounded-lg flex items-center justify-center mr-3">
                      <AlertTriangle className="text-red-700" size={16} />
                    </div>
                    <p className="text-sm text-red-800">{uploadErrors.internal}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Provider Statement Upload */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300">
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-purple-200">
              <h3 className="text-lg sm:text-xl font-semibold text-purple-900 flex items-center">
                <div className="w-10 h-10 bg-purple-200 rounded-xl flex items-center justify-center mr-3">
                  <FileText className="text-purple-700" size={20} />
                </div>
                Provider Statement
              </h3>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-purple-300 hover:bg-purple-50 transition-all duration-200">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload(e.target.files[0], 'provider')}
                  className="hidden"
                  id="provider-upload"
                />
                <label htmlFor="provider-upload" className="cursor-pointer">
                  <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Upload className="text-purple-600" size={28} />
                  </div>
                  <p className="text-gray-700 font-medium mb-2">Click to upload CSV file</p>
                  <p className="text-sm text-gray-500">Must contain: transaction_reference</p>
                </label>
              </div>
              {providerFile && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center mr-3">
                      <CheckCircle className="text-green-700" size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">{providerFile.name}</p>
                      <p className="text-xs text-green-600">{providerData.length} records loaded</p>
                    </div>
                  </div>
                </div>
              )}
              {uploadErrors.provider && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-red-200 rounded-lg flex items-center justify-center mr-3">
                      <AlertTriangle className="text-red-700" size={16} />
                    </div>
                    <p className="text-sm text-red-800">{uploadErrors.provider}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-8 sm:mb-12">
          <button
            onClick={performReconciliation}
            disabled={!internalData.length || !providerData.length || isProcessing}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center space-x-3 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle size={20} />}
            <span className="text-base font-semibold">{isProcessing ? 'Processing...' : 'Start Reconciliation'}</span>
          </button>
          <button
            onClick={resetReconciliation}
            className="bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 px-8 py-4 rounded-xl hover:from-gray-200 hover:to-gray-300 flex items-center justify-center space-x-3 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
          >
            <RefreshCw size={20} />
            <span className="text-base font-semibold">Reset</span>
          </button>
        </div>

        {/* Loading State */}
        {isProcessing && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 bg-gradient-to-r from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center">
                  <RefreshCw className="animate-spin text-blue-600" size={40} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Processing Reconciliation</h3>
                <p className="text-gray-600 text-lg">Analyzing transaction data and identifying discrepancies...</p>
                <div className="mt-6 flex space-x-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {reconciliationResults && (
          <div className={`space-y-6 sm:space-y-8 transition-all duration-700 ease-out ${
            showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 sm:p-6 rounded-2xl border border-green-200 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-200 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                    <CheckCircle className="text-green-700" size={20} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-green-700 mb-1">Matched</p>
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-900">{reconciliationResults.summary.matchedCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 sm:p-6 rounded-2xl border border-yellow-200 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-200 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                    <AlertTriangle className="text-yellow-700" size={20} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-yellow-700 mb-1">Internal Only</p>
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-yellow-900">{reconciliationResults.summary.internalOnlyCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 sm:p-6 rounded-2xl border border-red-200 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-200 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                    <XCircle className="text-red-700" size={20} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-red-700 mb-1">Provider Only</p>
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-900">{reconciliationResults.summary.providerOnlyCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 sm:p-6 rounded-2xl border border-blue-200 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-200 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                    <AlertTriangle className="text-blue-700" size={20} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-blue-700 mb-1">Mismatches</p>
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-900">
                      {reconciliationResults.summary.amountMismatchCount + reconciliationResults.summary.statusMismatchCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
              {/* Matched Transactions */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-900 flex items-center text-lg">
                      <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center mr-3">
                        <CheckCircle size={16} />
                      </div>
                      Matched Transactions ({reconciliationResults.matched.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.matched, 'matched_transactions.csv', 'matched')}
                      className="text-green-600 hover:text-green-800 transition-colors p-2 hover:bg-green-100 rounded-lg"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-6 max-h-80 sm:max-h-96 overflow-y-auto">
                  {reconciliationResults.matched.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-gray-400" size={24} />
                      </div>
                      <p className="text-gray-500 text-sm">No matched transactions</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reconciliationResults.matched.map((match, index) => (
                        <div key={index} className={`p-4 rounded-xl border ${
                          !match.amountMatch || !match.statusMatch 
                            ? 'border-yellow-200 bg-yellow-50' 
                            : 'border-gray-200 bg-gray-50'
                        } hover:shadow-sm transition-all duration-200`}>
                          <div className="font-mono text-sm font-medium text-gray-900 mb-2 break-all">
                            {match.transaction_reference}
                          </div>
                          {(!match.amountMatch || !match.statusMatch) && (
                            <div className="text-xs space-y-2">
                              {!match.amountMatch && (
                                <div className="flex items-center text-yellow-700">
                                  <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
                                  Amount: {formatCurrency(match.internal.amount)} vs {formatCurrency(match.provider.amount)}
                                </div>
                              )}
                              {!match.statusMatch && (
                                <div className="flex items-center text-yellow-700">
                                  <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
                                  Status: {match.internal.status} vs {match.provider.status}
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
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 px-6 py-4 border-b border-yellow-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-yellow-900 flex items-center text-lg">
                      <div className="w-8 h-8 bg-yellow-200 rounded-lg flex items-center justify-center mr-3">
                        <AlertTriangle size={16} />
                      </div>
                      Internal Only ({reconciliationResults.internalOnly.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.internalOnly, 'internal_only_transactions.csv')}
                      className="text-yellow-600 hover:text-yellow-800 transition-colors p-2 hover:bg-yellow-100 rounded-lg"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-6 max-h-80 sm:max-h-96 overflow-y-auto">
                  {reconciliationResults.internalOnly.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-gray-400" size={24} />
                      </div>
                      <p className="text-gray-500 text-sm">No internal-only transactions</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reconciliationResults.internalOnly.map((record, index) => (
                        <div key={index} className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:shadow-sm transition-all duration-200">
                          <div className="font-mono text-sm font-medium text-gray-900 mb-2 break-all">
                            {record.transaction_reference}
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            {record.amount && <div>Amount: {formatCurrency(record.amount)}</div>}
                            {record.status && <div>Status: {record.status}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Provider Only */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-red-900 flex items-center text-lg">
                      <div className="w-8 h-8 bg-red-200 rounded-lg flex items-center justify-center mr-3">
                        <XCircle size={16} />
                      </div>
                      Provider Only ({reconciliationResults.providerOnly.length})
                    </h3>
                    <button
                      onClick={() => exportToCSV(reconciliationResults.providerOnly, 'provider_only_transactions.csv')}
                      className="text-red-600 hover:text-red-800 transition-colors p-2 hover:bg-red-100 rounded-lg"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-6 max-h-80 sm:max-h-96 overflow-y-auto">
                  {reconciliationResults.providerOnly.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-gray-400" size={24} />
                      </div>
                      <p className="text-gray-500 text-sm">No provider-only transactions</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reconciliationResults.providerOnly.map((record, index) => (
                        <div key={index} className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:shadow-sm transition-all duration-200">
                          <div className="font-mono text-sm font-medium text-gray-900 mb-2 break-all">
                            {record.transaction_reference}
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            {record.amount && <div>Amount: {formatCurrency(record.amount)}</div>}
                            {record.status && <div>Status: {record.status}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reconciliation Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center mr-3">
                    <FileText size={16} />
                  </div>
                  Reconciliation Summary
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                      <div className="w-6 h-6 bg-blue-200 rounded-lg flex items-center justify-center mr-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                      </div>
                      File Statistics
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Internal Records:</span>
                        <span className="font-semibold text-gray-900">{reconciliationResults.summary.totalInternal}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Provider Records:</span>
                        <span className="font-semibold text-gray-900">{reconciliationResults.summary.totalProvider}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Match Rate:</span>
                        <span className="font-semibold text-blue-600">{
                          Math.round((reconciliationResults.summary.matchedCount / Math.max(reconciliationResults.summary.totalInternal, reconciliationResults.summary.totalProvider)) * 100)
                        }%</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                      <div className="w-6 h-6 bg-red-200 rounded-lg flex items-center justify-center mr-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                      </div>
                      Discrepancy Details
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Amount Mismatches:</span>
                        <span className="font-semibold text-red-600">{reconciliationResults.summary.amountMismatchCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Status Mismatches:</span>
                        <span className="font-semibold text-red-600">{reconciliationResults.summary.statusMismatchCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Issues:</span>
                        <span className="font-semibold text-red-600">{
                          reconciliationResults.summary.internalOnlyCount + 
                          reconciliationResults.summary.providerOnlyCount + 
                          reconciliationResults.summary.amountMismatchCount + 
                          reconciliationResults.summary.statusMismatchCount
                        }</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!reconciliationResults && !isProcessing && (
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-8 mt-8 sm:mt-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="text-blue-700" size={32} />
              </div>
              <h3 className="text-xl font-bold text-blue-900 mb-4">How to Use</h3>
              <div className="text-blue-800 space-y-3 max-w-2xl mx-auto">
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-800 text-xs font-bold">1</span>
                  </div>
                  <p>Upload your Internal System Export CSV file (must contain 'transaction_reference' column)</p>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-800 text-xs font-bold">2</span>
                  </div>
                  <p>Upload your Payment Processor Statement CSV file (must contain 'transaction_reference' column)</p>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-800 text-xs font-bold">3</span>
                  </div>
                  <p>Click "Start Reconciliation" to compare the files</p>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-800 text-xs font-bold">4</span>
                  </div>
                  <p>Review results and export discrepancies for further investigation</p>
                </div>
                <div className="mt-6 p-4 bg-blue-200 rounded-xl">
                  <p className="font-semibold text-blue-900">💡 Optional columns: amount, status (for enhanced mismatch detection)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReconciliationTool;