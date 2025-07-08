import React from 'react';
import { Container } from 'react-bootstrap';
import ResultFilter from '../components/ResultFilter';
import { TelegramContext } from '../context/TelegramContext';

const ResultFilterPage = () => {
  return (
    <TelegramContext.Consumer>
      {({ user }) => (
        <Container>
          <div className="py-4">
            <h1 className="mb-4">Công Cụ Lọc Kết Quả Xổ Số</h1>
            <p className="text-muted">
              Sử dụng công cụ này để lọc kết quả xổ số theo chữ số cuối, giúp dễ dàng dò số và phân tích xu hướng.
            </p>
            <ResultFilter />
          </div>
        </Container>
      )}
    </TelegramContext.Consumer>
  );
};

export default ResultFilterPage; 