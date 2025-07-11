import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WeeklyStructureForm.css';

const WeeklyStructureForm = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  
  // Tải dữ liệu cấu trúc hàng tuần
  useEffect(() => {
    const fetchWeeklyData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/weekly-structure');
        setWeeklyData(response.data);
      } catch (error) {
        console.error('Không thể tải dữ liệu cấu trúc:', error);
        showMessage('Không thể tải dữ liệu cấu trúc xổ số hàng tuần', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchWeeklyData();
  }, []);
  
  const handleDayChange = (dayIndex, field, value) => {
    const updatedData = { ...weeklyData };
    updatedData.days[dayIndex][field] = value;
    setWeeklyData(updatedData);
  };
  
  const handleProvinceChange = (dayIndex, provinceIndex, field, value) => {
    const updatedData = { ...weeklyData };
    updatedData.days[dayIndex].provinces[provinceIndex][field] = value;
    setWeeklyData(updatedData);
  };
  
  const addProvince = (dayIndex) => {
    const updatedData = { ...weeklyData };
    updatedData.days[dayIndex].provinces.push({
      name: '',
      code: '',
      info: ''
    });
    setWeeklyData(updatedData);
  };
  
  const removeProvince = (dayIndex, provinceIndex) => {
    const updatedData = { ...weeklyData };
    updatedData.days[dayIndex].provinces.splice(provinceIndex, 1);
    setWeeklyData(updatedData);
  };
  
  const showMessage = (text, type) => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage(null);
      setMessageType(null);
    }, 5000);
  };
  
  const validateForm = () => {
    // Kiểm tra mỗi ngày
    for (let i = 0; i < weeklyData.days.length; i++) {
      const day = weeklyData.days[i];
      
      if (!day.weekday) {
        showMessage(`Ngày thứ ${i + 1} thiếu thông tin thứ`, 'error');
        return false;
      }
      
      if (!day.provinces || day.provinces.length === 0) {
        showMessage(`Ngày ${day.weekday} cần ít nhất một tỉnh/thành`, 'error');
        return false;
      }
      
      // Kiểm tra từng tỉnh trong ngày
      for (let j = 0; j < day.provinces.length; j++) {
        const province = day.provinces[j];
        
        if (!province.name || !province.code) {
          showMessage(`Tỉnh thứ ${j + 1} trong ngày ${day.weekday} thiếu tên hoặc mã`, 'error');
          return false;
        }
      }
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSaving(true);
    
    try {
      await axios.post('/api/admin/weekly-structure', weeklyData);
      showMessage('Cập nhật cấu trúc xổ số hàng tuần thành công!', 'success');
    } catch (error) {
      showMessage(`Lỗi: ${error.response?.data?.message || error.message}`, 'error');
      console.error('Error updating weekly structure:', error);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <div className="loading-container">Đang tải dữ liệu...</div>;
  }
  
  if (!weeklyData) {
    return <div className="error-container">Không thể tải dữ liệu</div>;
  }
  
  return (
    <div className="weekly-structure-container">
      <h2>Quản lý cấu trúc xổ số hàng tuần</h2>
      
      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="days-container">
          {weeklyData.days.map((day, dayIndex) => (
            <div key={dayIndex} className="day-section">
              <h3>Ngày {dayIndex + 1}</h3>
              
              <div className="day-header">
                <div className="form-group">
                  <label>Thứ:</label>
                  <input
                    type="text"
                    value={day.weekday}
                    onChange={(e) => handleDayChange(dayIndex, 'weekday', e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="provinces-container">
                <h4>Các tỉnh/thành phố</h4>
                
                {day.provinces.map((province, provinceIndex) => (
                  <div key={provinceIndex} className="province-item">
                    <div className="form-group">
                      <label>Tên:</label>
                      <input
                        type="text"
                        value={province.name}
                        onChange={(e) => handleProvinceChange(dayIndex, provinceIndex, 'name', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>Mã:</label>
                      <input
                        type="text"
                        value={province.code}
                        onChange={(e) => handleProvinceChange(dayIndex, provinceIndex, 'code', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>Thông tin thêm:</label>
                      <input
                        type="text"
                        value={province.info || ''}
                        onChange={(e) => handleProvinceChange(dayIndex, provinceIndex, 'info', e.target.value)}
                      />
                    </div>
                    
                    <button 
                      type="button" 
                      className="remove-btn"
                      onClick={() => removeProvince(dayIndex, provinceIndex)}
                      disabled={day.provinces.length <= 1}
                    >
                      Xóa
                    </button>
                  </div>
                ))}
                
                <button
                  type="button"
                  className="add-btn"
                  onClick={() => addProvince(dayIndex)}
                >
                  Thêm tỉnh/thành
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <button type="submit" className="submit-button" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Cập nhật cấu trúc'}
        </button>
      </form>
    </div>
  );
};

export default WeeklyStructureForm; 