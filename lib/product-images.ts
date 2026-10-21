const images:Record<string,string>={
 'Váy lụa xanh':'/products/hoa-xanh.png',
 'Xanh coban':'/products/xanh-coban.jpg',
 'Váy lụa hoa to':'/products/hoa-to.jpg',
 'Váy lụa hoa nhí':'/products/hoa-nhi.jpg',
 'Váy lụa hoa tím':'/products/tim.jpg',
 'Váy lụa hoa hồng':'/products/hong.jpg',
 'Váy hoa cổ giọt lệ xanh':'/products/vay-hoa-co-giot-le-xanh.jpg',
 'Váy hoa cổ giọt lệ đỏ':'/products/vay-hoa-co-giot-le-do.jpg',
};

export function productImage(name:string,products?:{name:string;image?:string}[]){return products?.find(product=>product.name===name)?.image||images[name];}
