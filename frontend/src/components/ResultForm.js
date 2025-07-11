import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ResultForm.css';

const ResultForm = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [loadingWeekly, setLoadingWeekly] = useState(true);

  const emptyResults = {
    eighth: '',
    seventh: '',
    sixth: ['', '', ''],
    fifth: '',
    fourth: ['', '', '', '', '', '', ''],
    third: ['', ''],
    second: '',
    first: '',
    special: ''
  };

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    weekday: getWeekday(new Date()),
    region: 'Miền Nam',
    provinces: [
      {
        name: 'TP.HCM',
        code: 'XSHCM',
        info: '',
        results: { ...emptyResults }
      },
      {
        name: 'Đồng Tháp',
        code: 'XSDT',
        info: '',
        results: { ...emptyResults }
      },
      {
        name: 'Cà Mau',
        code: 'XSCM',
        info: '',
        results: { ...emptyResults }
      }
    ]
  });

  function getWeekday(date) {
    const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    return weekdays[date.getDay()];
  }

  // Tải dữ liệu cấu hình hàng tuần
  useEffect(() => {
    const fetchWeeklyData = async () => {
      try {
        setLoadingWeekly(true);
        const response = await axios.get('/api/weekly-structure');
        setWeeklyData(response.data);
        
        // Cập nhật provinces dựa trên ngày hiện tại
        updateProvincesBasedOnWeekday(getWeekday(new Date()), response.data);
      } catch (error) {
        console.error('Không thể tải dữ liệu weekly_kqxs.json:', error);
        showMessage('Không thể tải dữ liệu cấu trúc xổ số hàng tuần', 'error');
      } finally {
        setLoadingWeekly(false);
      }
    };
    
    fetchWeeklyData();
  }, []);

  // Cập nhật danh sách tỉnh dựa trên ngày trong tuần
  const updateProvincesBasedOnWeekday = (weekday, data = weeklyData) => {
    if (!data) return;
    
    const dayConfig = data.days.find(day => day.weekday === weekday);
    
    if (dayConfig) {
      const updatedProvinces = dayConfig.provinces.map(province => ({
        name: province.name,
        code: province.code,
        info: province.info || '',
        results: { ...emptyResults }
      }));
      
      setFormData(prevData => ({
        ...prevData,
        weekday,
        provinces: updatedProvinces
      }));
    }
  };

  const handleDateChange = (e) => {
    const date = new Date(e.target.value);
    const newWeekday = getWeekday(date);
    
    setFormData(prevData => ({
      ...prevData,
      date: e.target.value,
      weekday: newWeekday
    }));
    
    // Cập nhật danh sách tỉnh dựa trên ngày mới
    updateProvincesBasedOnWeekday(newWeekday);
  };

  const handleRegionChange = (e) => {
    setFormData({
      ...formData,
      region: e.target.value
    });
  };

  const handleProvinceChange = (index, field, value) => {
    const provinces = [...formData.provinces];
    provinces[index][field] = value;
    setFormData({
      ...formData,
      provinces
    });
  };

  const handleResultChange = (provinceIndex, prizeKey, value, arrayIndex = null) => {
    const provinces = [...formData.provinces];
    
    if (arrayIndex !== null) {
      // Đây là giải với nhiều số (giải 6, 4, 3)
      provinces[provinceIndex].results[prizeKey][arrayIndex] = value;
    } else {
      // Đây là giải với một số (giải 8, 7, 5, 2, 1, đặc biệt)
      provinces[provinceIndex].results[prizeKey] = value;
    }
    
    setFormData({
      ...formData,
      provinces
    });
  };

  const validateForm = () => {
    // Kiểm tra ngày
    if (!formData.date) {
      showMessage('Vui lòng chọn ngày', 'error');
      return false;
    }

    // Kiểm tra từng tỉnh
    for (let i = 0; i < formData.provinces.length; i++) {
      const province = formData.provinces[i];
      
      // Kiểm tra tên và mã tỉnh
      if (!province.name || !province.code) {
        showMessage(`Tỉnh thứ ${i + 1} thiếu tên hoặc mã`, 'error');
        return false;
      }
      
      // Kiểm tra giải 8
      if (!/^\d{2}$/.test(province.results.eighth)) {
        showMessage(`Giải 8 của ${province.name} không hợp lệ. Phải là 2 chữ số.`, 'error');
        return false;
      }
      
      // Kiểm tra giải 7
      if (!/^\d{3}$/.test(province.results.seventh)) {
        showMessage(`Giải 7 của ${province.name} không hợp lệ. Phải là 3 chữ số.`, 'error');
        return false;
      }
      
      // Kiểm tra giải 6
      for (let j = 0; j < 3; j++) {
        if (!/^\d{4}$/.test(province.results.sixth[j])) {
          showMessage(`Giải 6 #${j + 1} của ${province.name} không hợp lệ. Phải là 4 chữ số.`, 'error');
          return false;
        }
      }
      
      // Kiểm tra giải 5
      if (!/^\d{4}$/.test(province.results.fifth)) {
        showMessage(`Giải 5 của ${province.name} không hợp lệ. Phải là 4 chữ số.`, 'error');
        return false;
      }
      
      // Kiểm tra giải 4
      for (let j = 0; j < 7; j++) {
        if (!/^\d{5}$/.test(province.results.fourth[j])) {
          showMessage(`Giải 4 #${j + 1} của ${province.name} không hợp lệ. Phải là 5 chữ số.`, 'error');
          return false;
        }
      }
      
      // Kiểm tra giải 3
      for (let j = 0; j < 2; j++) {
        if (!/^\d{5}$/.test(province.results.third[j])) {
          showMessage(`Giải 3 #${j + 1} của ${province.name} không hợp lệ. Phải là 5 chữ số.`, 'error');
          return false;
        }
      }
      
      // Kiểm tra giải 2
      if (!/^\d{5}$/.test(province.results.second)) {
        showMessage(`Giải 2 của ${province.name} không hợp lệ. Phải là 5 chữ số.`, 'error');
        return false;
      }
      
      // Kiểm tra giải 1
      if (!/^\d{5}$/.test(province.results.first)) {
        showMessage(`Giải 1 của ${province.name} không hợp lệ. Phải là 5 chữ số.`, 'error');
        return false;
      }
      
      // Kiểm tra giải đặc biệt
      if (!/^\d{6}$/.test(province.results.special)) {
        showMessage(`Giải đặc biệt của ${province.name} không hợp lệ. Phải là 6 chữ số.`, 'error');
        return false;
      }
    }
    
    return true;
  };

  const showMessage = (text, type) => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage(null);
      setMessageType(null);
    }, 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post('/api/admin/results', formData);
      showMessage('Kết quả xổ số đã được cập nhật thành công!', 'success');
      console.log('Response:', response.data);
    } catch (error) {
      showMessage(`Lỗi: ${error.response?.data?.message || error.message}`, 'error');
      console.error('Error submitting form:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loadingWeekly) {
    return <div className="loading-container">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="result-form-container">
      <h2>Cập nhật kết quả xổ số</h2>
      
      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-header">
          <div className="form-group">
            <label>Ngày:</label>
            <input
              type="date"
              value={formData.date}
              onChange={handleDateChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Thứ:</label>
            <input
              type="text"
              value={formData.weekday}
              readOnly
            />
          </div>
          
          <div className="form-group">
            <label>Khu vực:</label>
            <select value={formData.region} onChange={handleRegionChange}>
              <option value="Miền Nam">Miền Nam</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Bắc">Miền Bắc</option>
            </select>
          </div>
        </div>
        
        {formData.provinces.map((province, provinceIndex) => (
          <div key={provinceIndex} className="province-section">
            <h3>Tỉnh/Thành {provinceIndex + 1}</h3>
            
            <div className="province-header">
              <div className="form-group">
                <label>Tên:</label>
                <input
                  type="text"
                  value={province.name}
                  onChange={(e) => handleProvinceChange(provinceIndex, 'name', e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Mã:</label>
                <input
                  type="text"
                  value={province.code}
                  onChange={(e) => handleProvinceChange(provinceIndex, 'code', e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Thông tin thêm:</label>
                <input
                  type="text"
                  value={province.info}
                  onChange={(e) => handleProvinceChange(provinceIndex, 'info', e.target.value)}
                />
              </div>
            </div>
            
            <div className="results-section">
              {/* Giải 8 */}
              <div className="prize-group">
                <label>Giải 8 (2 số):</label>
                <input
                  type="text"
                  maxLength="2"
                  pattern="[0-9]{2}"
                  value={province.results.eighth}
                  onChange={(e) => handleResultChange(provinceIndex, 'eighth', e.target.value)}
                  required
                />
              </div>
              
              {/* Giải 7 */}
              <div className="prize-group">
                <label>Giải 7 (3 số):</label>
                <input
                  type="text"
                  maxLength="3"
                  pattern="[0-9]{3}"
                  value={province.results.seventh}
                  onChange={(e) => handleResultChange(provinceIndex, 'seventh', e.target.value)}
                  required
                />
              </div>
              
              {/* Giải 6 */}
              <div className="prize-group prize-multi">
                <label>Giải 6 (4 số, 3 giải):</label>
                <div className="multi-inputs">
                  {province.results.sixth.map((num, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength="4"
                      pattern="[0-9]{4}"
                      value={num}
                      onChange={(e) => handleResultChange(provinceIndex, 'sixth', e.target.value, idx)}
                      required
                    />
                  ))}
                </div>
              </div>
              
              {/* Giải 5 */}
              <div className="prize-group">
                <label>Giải 5 (4 số):</label>
                <input
                  type="text"
                  maxLength="4"
                  pattern="[0-9]{4}"
                  value={province.results.fifth}
                  onChange={(e) => handleResultChange(provinceIndex, 'fifth', e.target.value)}
                  required
                />
              </div>
              
              {/* Giải 4 */}
              <div className="prize-group prize-multi">
                <label>Giải 4 (5 số, 7 giải):</label>
                <div className="multi-inputs">
                  {province.results.fourth.map((num, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength="5"
                      pattern="[0-9]{5}"
                      value={num}
                      onChange={(e) => handleResultChange(provinceIndex, 'fourth', e.target.value, idx)}
                      required
                    />
                  ))}
                </div>
              </div>
              
              {/* Giải 3 */}
              <div className="prize-group prize-multi">
                <label>Giải 3 (5 số, 2 giải):</label>
                <div className="multi-inputs">
                  {province.results.third.map((num, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength="5"
                      pattern="[0-9]{5}"
                      value={num}
                      onChange={(e) => handleResultChange(provinceIndex, 'third', e.target.value, idx)}
                      required
                    />
                  ))}
                </div>
              </div>
              
              {/* Giải 2 */}
              <div className="prize-group">
                <label>Giải 2 (5 số):</label>
                <input
                  type="text"
                  maxLength="5"
                  pattern="[0-9]{5}"
                  value={province.results.second}
                  onChange={(e) => handleResultChange(provinceIndex, 'second', e.target.value)}
                  required
                />
              </div>
              
              {/* Giải 1 */}
              <div className="prize-group">
                <label>Giải 1 (5 số):</label>
                <input
                  type="text"
                  maxLength="5"
                  pattern="[0-9]{5}"
                  value={province.results.first}
                  onChange={(e) => handleResultChange(provinceIndex, 'first', e.target.value)}
                  required
                />
              </div>
              
              {/* Giải Đặc Biệt */}
              <div className="prize-group special-prize">
                <label>Giải Đặc Biệt (6 số):</label>
                <input
                  type="text"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={province.results.special}
                  onChange={(e) => handleResultChange(provinceIndex, 'special', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        ))}
        
        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Đang gửi...' : 'Cập nhật kết quả'}
        </button>
      </form>
    </div>
  );
};

export default ResultForm; 