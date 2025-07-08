import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Card, Badge, Table, Tabs, Tab } from 'react-bootstrap';
import { useApi } from '../hooks/useApi';
import './ResultFilter.css';

const ResultFilter = ({ resultId = 'latest' }) => {
  const [selectedDigit, setSelectedDigit] = useState('');
  const [selectedDigits, setSelectedDigits] = useState([]);
  const [filteredResult, setFilteredResult] = useState(null);
  const [frequency, setFrequency] = useState(null);
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const api = useApi();

  // Lọc kết quả theo một chữ số cuối
  const handleFilterSingle = async () => {
    if (selectedDigit === '') {
      setError('Vui lòng chọn một chữ số');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await api.get(`/results/${resultId}/filter?digit=${selectedDigit}`);
      setFilteredResult(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lọc kết quả');
    } finally {
      setLoading(false);
    }
  };

  // Lọc kết quả theo nhiều chữ số cuối
  const handleFilterMultiple = async () => {
    if (selectedDigits.length === 0) {
      setError('Vui lòng chọn ít nhất một chữ số');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await api.get(`/results/${resultId}/filter-multi?digits=${selectedDigits.join(',')}`);
      setFilteredResult(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lọc kết quả');
    } finally {
      setLoading(false);
    }
  };

  // Lấy thống kê tần suất
  const fetchFrequency = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await api.get(`/results/statistics/frequency?days=${days}`);
      setFrequency(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lấy thống kê tần suất');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý chọn/bỏ chọn chữ số trong chế độ nhiều chữ số
  const handleDigitToggle = (digit) => {
    if (selectedDigits.includes(digit)) {
      setSelectedDigits(selectedDigits.filter(d => d !== digit));
    } else {
      setSelectedDigits([...selectedDigits, digit]);
    }
  };

  // Lấy thống kê tần suất khi component được tải hoặc khi số ngày thay đổi
  useEffect(() => {
    fetchFrequency();
  }, [days]);

  // Xử lý khi chuyển tab
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFilteredResult(null);
    setError('');
  };

  // Kiểm tra xem một số có chữ số cuối trùng khớp với bộ lọc hay không
  const isMatchingDigit = (number) => {
    if (!number || number === '-') return false;
    
    const lastDigit = String(number).slice(-1);
    
    if (activeTab === 'single') {
      return lastDigit === selectedDigit;
    } else if (activeTab === 'multiple') {
      return selectedDigits.includes(parseInt(lastDigit));
    }
    
    return false;
  };
  
  // Tạo className dựa vào việc số có khớp hay không
  const getNumberClass = (number) => {
    if (!filteredResult) return '';
    return isMatchingDigit(number) ? 'highlighted-number' : '';
  };

  // Render một số với định dạng highlight nếu khớp
  const renderNumber = (number) => {
    if (!number || number === '-') return '-';
    
    const className = getNumberClass(number);
    return <span className={className}>{number}</span>;
  };
  
  // Render mảng các số
  const renderNumberArray = (numbers) => {
    if (!numbers || numbers.length === 0) return '-';
    
    return numbers.map((number, idx) => (
      <React.Fragment key={idx}>
        {idx > 0 && ', '}
        {renderNumber(number)}
      </React.Fragment>
    ));
  };

  return (
    <Container className="mt-4">
      <h2 className="mb-4">Lọc Kết Quả Xổ Số</h2>
      
      <Tabs activeKey={activeTab} onSelect={handleTabChange} className="mb-4">
        <Tab eventKey="single" title="Lọc Theo Một Chữ Số">
          <Card className="mb-4">
            <Card.Body>
              <Form>
                <Row className="align-items-end">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Chọn chữ số cuối</Form.Label>
                      <Form.Select 
                        value={selectedDigit} 
                        onChange={(e) => setSelectedDigit(e.target.value)}
                      >
                        <option value="">-- Chọn chữ số --</option>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
                          <option key={digit} value={digit}>{digit}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Button 
                      variant="primary" 
                      onClick={handleFilterSingle}
                      disabled={loading || selectedDigit === ''}
                    >
                      {loading ? 'Đang lọc...' : 'Lọc Kết Quả'}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
        </Tab>
        
        <Tab eventKey="multiple" title="Lọc Theo Nhiều Chữ Số">
          <Card className="mb-4">
            <Card.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Chọn các chữ số cuối</Form.Label>
                  <div className="d-flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
                      <Button
                        key={digit}
                        variant={selectedDigits.includes(digit) ? "primary" : "outline-primary"}
                        onClick={() => handleDigitToggle(digit)}
                        className="px-3 py-2"
                      >
                        {digit}
                      </Button>
                    ))}
                  </div>
                </Form.Group>
                <Button 
                  variant="primary" 
                  onClick={handleFilterMultiple}
                  disabled={loading || selectedDigits.length === 0}
                >
                  {loading ? 'Đang lọc...' : 'Lọc Kết Quả'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Tab>
        
        <Tab eventKey="frequency" title="Thống Kê Tần Suất">
          <Card className="mb-4">
            <Card.Body>
              <Form>
                <Row className="align-items-end mb-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Số ngày thống kê</Form.Label>
                      <Form.Control 
                        type="number" 
                        value={days} 
                        onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                        min="1"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Button 
                      variant="primary" 
                      onClick={fetchFrequency}
                      disabled={loading}
                    >
                      {loading ? 'Đang tải...' : 'Cập Nhật Thống Kê'}
                    </Button>
                  </Col>
                </Row>
                
                {frequency && (
                  <div>
                    <h5>Thống kê tần suất xuất hiện trong {frequency.days} ngày gần đây</h5>
                    <Table striped bordered hover responsive className="mt-3">
                      <thead>
                        <tr>
                          <th>Chữ số</th>
                          <th>Số lần xuất hiện</th>
                          <th>Tỷ lệ</th>
                          <th>Giải ĐB</th>
                          <th>Giải nhất</th>
                          <th>Giải nhì</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(frequency.digits).map(([digit, data]) => (
                          <tr key={digit}>
                            <td className="text-center fw-bold">{digit}</td>
                            <td>{data.count}</td>
                            <td>{data.percentage}%</td>
                            <td>{data.byPrize.special}</td>
                            <td>{data.byPrize.first}</td>
                            <td>{data.byPrize.second}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Form>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
      
      {error && (
        <div className="alert alert-danger">{error}</div>
      )}
      
      {filteredResult && (
        <Card>
          <Card.Header>
            <h4>
              Kết quả lọc theo chữ số {activeTab === 'single' ? selectedDigit : selectedDigits.join(', ')}
              <small className="text-muted ms-2">
                {new Date(filteredResult.date).toLocaleDateString('vi-VN')}
              </small>
            </h4>
          </Card.Header>
          <Card.Body>
            {filteredResult.provinces.map((province) => (
              <div key={province.code} className="mb-4">
                <h5>{province.name} <Badge bg="info">{province.matchCount} số trùng khớp</Badge></h5>
                <Table bordered size="sm" className="table-result">
                  <thead>
                    <tr>
                      <th>Giải</th>
                      <th>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Giải đặc biệt</td>
                      <td>{renderNumber(province.results.special)}</td>
                    </tr>
                    <tr>
                      <td>Giải nhất</td>
                      <td>{renderNumber(province.results.first)}</td>
                    </tr>
                    <tr>
                      <td>Giải nhì</td>
                      <td>{renderNumber(province.results.second)}</td>
                    </tr>
                    <tr>
                      <td>Giải ba</td>
                      <td>{renderNumberArray(province.results.third)}</td>
                    </tr>
                    <tr>
                      <td>Giải tư</td>
                      <td>{renderNumberArray(province.results.fourth)}</td>
                    </tr>
                    <tr>
                      <td>Giải năm</td>
                      <td>{renderNumber(province.results.fifth)}</td>
                    </tr>
                    <tr>
                      <td>Giải sáu</td>
                      <td>{renderNumberArray(province.results.sixth)}</td>
                    </tr>
                    <tr>
                      <td>Giải bảy</td>
                      <td>{renderNumber(province.results.seventh)}</td>
                    </tr>
                    <tr>
                      <td>Giải tám</td>
                      <td>{renderNumber(province.results.eighth)}</td>
                    </tr>
                  </tbody>
                </Table>
              </div>
            ))}
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default ResultFilter; 