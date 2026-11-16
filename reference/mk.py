import numpy as np, struct
def write(path,T):
    with open(path,'wb') as f:
        f.write(b'\0'*80); f.write(struct.pack('<I',len(T)))
        for t in T: f.write(struct.pack('<12fH',0,0,0,*t.reshape(-1),0))
def grid_mesh(fu,fv,nu,nv,closed_u=True):
    P=np.array([[fu(i/nu,j/nv) for j in range(nv)] for i in range(nu if closed_u else nu+1)])
    T=[]
    for i in range(P.shape[0]-(0 if closed_u else 1)):
        for j in range(nv):
            a,b,c,d=P[i,j],P[(i+1)%P.shape[0],j],P[(i+1)%P.shape[0],(j+1)%nv],P[i,(j+1)%nv]
            T+= [np.array([a,b,c]),np.array([a,c,d])]
    return np.array(T)
# torus (hole through it -> 2 loops per slice that must NOT be linked together)
R,r=6,2
torus=grid_mesh(lambda u,v:((R+r*np.cos(2*np.pi*v))*np.cos(2*np.pi*u),(R+r*np.cos(2*np.pi*v))*np.sin(2*np.pi*u),r*np.sin(2*np.pi*v)),None,60,30)
write('torus.stl',torus)
# sphere
def sph(u,v):
    th=np.pi*(u); ph=2*np.pi*v
    return (np.sin(th)*np.cos(ph),np.sin(th)*np.sin(ph),np.cos(th))
P=[];sphere=[]
nu,nv=40,60
pts=np.array([[sph((i+0.0)/nu,j/nv) for j in range(nv)] for i in range(1,nu)])
for i in range(nu-2):
    for j in range(nv):
        a,b,c,d=pts[i,j],pts[i+1,j],pts[i+1,(j+1)%nv],pts[i,(j+1)%nv]
        sphere+=[np.array([a,b,c]),np.array([a,c,d])]
write('sphere.stl',np.array(sphere))   # open at poles (non-watertight on purpose)
# cube
V=np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],float)
F=[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
write('cube.stl',np.array([V[list(f)] for f in F]))
