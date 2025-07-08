exports.validateNumber = (number, type) => {
  if (type === '2D') {
    return /^[0-9]{2}$/.test(number);
  }
  if (type === '3D') {
    return /^[0-9]{3}$/.test(number);
  }
  return false;
};