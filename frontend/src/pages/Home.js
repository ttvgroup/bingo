// frontend/src/pages/Home.js
import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { TelegramContext } from '../context/TelegramContext';

const Home = () => {
  return (
    <TelegramContext.Consumer>
      {({ user }) => (
        <Container className="py-5">
          <Row className="mb-4">
            <Col>
              <h1 className="text-center">Hệ Thống Xổ Số Miền Nam</h1>
              <p className="text-center text-muted">
                Chào mừng {user ? user.username : 'bạn'} đến với hệ thống xổ số miền Nam
              </p>
            </Col>
          </Row>

          <Row className="mb-5">
            <Col md={4} className="mb-3">
              <Card className="h-100">
                <Card.Body>
                  <Card.Title>Kết Quả Xổ Số</Card.Title>
                  <Card.Text>
                    Xem kết quả xổ số mới nhất và các kỳ trước đó.
                  </Card.Text>
                  <Button as={Link} to="/" variant="primary">Xem Kết Quả</Button>
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={4} className="mb-3">
              <Card className="h-100 bg-light border-primary">
                <Card.Body>
                  <Card.Title>Công Cụ Lọc Kết Quả</Card.Title>
                  <Card.Text>
                    Lọc kết quả theo chữ số cuối, giúp dễ dàng dò số và phân tích xu hướng.
                  </Card.Text>
                  <Button as={Link} to="/filter-results" variant="primary">Lọc Kết Quả</Button>
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={4} className="mb-3">
              <Card className="h-100">
                <Card.Body>
                  <Card.Title>Đặt Cược</Card.Title>
                  <Card.Text>
                    Đặt cược cho các loại hình xổ số khác nhau.
                  </Card.Text>
                  <Button as={Link} to="/" variant="primary">Đặt Cược</Button>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {user && (
            <Row className="mb-4">
              <Col>
                <Card>
                  <Card.Body>
                    <Card.Title>Tài Khoản Của Bạn</Card.Title>
                    <Card.Text>
                      Quản lý thông tin tài khoản và xem lịch sử cược.
                    </Card.Text>
                    <Button as={Link} to="/profile" variant="outline-primary">Xem Tài Khoản</Button>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
        </Container>
      )}
    </TelegramContext.Consumer>
  );
};

export default Home;