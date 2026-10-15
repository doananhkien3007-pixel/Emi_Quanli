import json, datetime, pathlib, openpyxl
source = pathlib.Path('/Users/kiendoan/Downloads/Quản Lí Đơn hàng _ Emi House (11).xlsx')
wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
orders = []
for index, row in enumerate(list(wb.worksheets[0].values)[3:], 4):
    if len(row) < 11 or not row[5] or not isinstance(row[0],datetime.datetime): continue
    item=dict(product=str(row[5]),size=str(row[6] or ''),quantity=int(row[7] or 1),price=float(row[8] or 0),cost=float(row[9] or 0))
    if row[2]:
        orders.append(dict(id=f'EH-{int(row[1]):04}',date=row[0].strftime('%Y-%m-%d'),customer=str(row[2]).strip(),phone=str(row[3] or '').strip(),address=str(row[4] or '').strip(),**item,status=row[10],note=str(row[11] or ''),sourceRow=index,items=[item]))
    else:
        o=orders[-1]; assert o['status']==row[10]
        o['items'].append(item);o['quantity']+=item['quantity'];o['price']+=item['price'];o['cost']+=item['cost']
        o['product']=' + '.join(dict.fromkeys(i['product'] for i in o['items']))
        o['size']=', '.join(dict.fromkeys(i['size'] for i in o['items'] if i['size']))
        if row[11]:o['note']+=' '+str(row[11])
expenses=[]
for row in list(wb.worksheets[1].values)[9:]:
    if row and isinstance(row[0],datetime.datetime) and len(row)>8 and isinstance(row[8],(int,float)) and row[8]:
        expenses.append(dict(id=f'ADS-{len(expenses)+1:03}',date=row[0].strftime('%Y-%m-%d'),category='Quảng cáo',name='Facebook Ads',amount=row[8],note='Nhập từ sheet DOANH THU'))
products=[]
for row in list(wb.worksheets[2].values)[3:]:
    if len(row)>5 and row[3]:products.append(dict(name=row[3],price=row[4],cost=row[5]))
data=dict(orders=orders,expenses=expenses,products=products,settings=dict(shipping=12000,returnShipping=7000,platformRate=10,cardRate=1.1),undatedInbound=146000,source=source.name)
pathlib.Path('db/seed.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(json.dumps(dict(orders=len(orders),expenses=len(expenses),products=len(products),gross=sum(o['price'] for o in orders),revenue=sum(o['price'] for o in orders if o['status']=='Giao thành công'),ads=sum(e['amount'] for e in expenses))))
